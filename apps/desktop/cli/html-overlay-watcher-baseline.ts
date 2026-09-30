import { setTimeout as delay } from "node:timers/promises";

interface BaselineClock {
  readonly now: () => number;
  readonly wait: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}

const clock: BaselineClock = {
  now: () => performance.now(),
  wait: async (milliseconds, signal) => { await delay(milliseconds, undefined, { signal }); },
};

/** Drain asynchronous preparation notifications before revalidating the saved identities. */
interface BrowserWatcherBaselineOptions {
  readonly signal: AbortSignal;
  readonly version: () => number;
  readonly failure: () => Error | undefined;
  readonly quietMs: number;
  readonly deadlineMs: number;
  readonly clock?: BaselineClock;
}

export async function settleBrowserWatcherBaseline(options: BrowserWatcherBaselineOptions): Promise<void> {
  const timing = options.clock ?? clock;
  const started = timing.now();
  let lastActivity = started;
  let observedVersion = options.version();
  for (;;) {
    options.signal.throwIfAborted();
    const failure = options.failure();
    if (failure !== undefined) throw failure;
    const now = timing.now();
    const version = options.version();
    if (version !== observedVersion) {
      observedVersion = version;
      lastActivity = now;
    }
    if (now - started >= options.deadlineMs) {
      throw new Error("Browser runtime filesystem notifications did not settle before launch.");
    }
    if (now - lastActivity >= options.quietMs) return;
    await timing.wait(Math.min(50, options.quietMs - (now - lastActivity), options.deadlineMs - (now - started)), options.signal);
  }
}

/** Every discarded notification batch must precede a stable, complete identity check. */
export async function verifyStableBrowserWatcherBaseline(options: BrowserWatcherBaselineOptions & {
  readonly verify: () => Promise<void>;
  readonly commit: () => void;
}): Promise<void> {
  for (let pass = 0; pass < 3; pass += 1) {
    await settleBrowserWatcherBaseline(options);
    const version = options.version();
    await options.verify();
    options.signal.throwIfAborted();
    const failure = options.failure();
    if (failure !== undefined) throw failure;
    if (options.version() === version) {
      // No await may separate the stable-generation check from arming the guard.
      options.commit();
      return;
    }
  }
  throw new Error("Browser runtime filesystem notifications changed during all three verification passes.");
}
