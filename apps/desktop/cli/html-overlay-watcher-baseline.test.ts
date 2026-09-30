import { expect, test } from "bun:test";
import { settleBrowserWatcherBaseline, verifyStableBrowserWatcherBaseline } from "./html-overlay-watcher-baseline";

function fixture(events: readonly number[] = []) {
  let now = 0;
  let failure: Error | undefined;
  const controller = new AbortController();
  return {
    controller,
    fail: (error: Error) => { failure = error; },
    now: () => now,
    options: {
      signal: controller.signal,
      version: () => events.filter(at => at <= now).length,
      failure: () => failure,
      quietMs: 2_000,
      deadlineMs: 10_000,
      clock: {
        now: () => now,
        wait: async (milliseconds: number) => { now += milliseconds; },
      },
    },
  };
}

test("late native preparation events extend the baseline quiet period", async () => {
  // Measured macOS FSEvents timings from a rejected production-sized snapshot.
  const item = fixture([219, 223, 402, 406, 1_131]);
  await settleBrowserWatcherBaseline(item.options);
  expect(item.now()).toBe(3_150);
});

test("an empty baseline waits a full quiet interval", async () => {
  const item = fixture();
  await settleBrowserWatcherBaseline(item.options);
  expect(item.now()).toBe(2_000);
});

test("a continuously changing tree rejects within its bounded deadline", async () => {
  const item = fixture(Array.from({ length: 21 }, (_, index) => index * 500));
  await expect(settleBrowserWatcherBaseline(item.options)).rejects.toThrow("did not settle");
  expect(item.now()).toBe(10_000);
});

test("watcher failure is never discarded as a preparation event", async () => {
  const item = fixture();
  const failure = new Error("fixture watcher failed");
  const wait = item.options.clock.wait;
  item.options.clock.wait = async milliseconds => { await wait(milliseconds); item.fail(failure); };
  await expect(settleBrowserWatcherBaseline(item.options)).rejects.toBe(failure);
});

test("cancellation stops the wait before browser launch", async () => {
  const item = fixture();
  const cancellation = new Error("fixture cancelled");
  const wait = item.options.clock.wait;
  item.options.clock.wait = async milliseconds => { await wait(milliseconds); item.controller.abort(cancellation); };
  await expect(settleBrowserWatcherBaseline(item.options)).rejects.toBe(cancellation);
  expect(item.now()).toBe(50);
});

test("the baseline does not consume notifications arriving after its return", async () => {
  const item = fixture([2_050]);
  await settleBrowserWatcherBaseline(item.options);
  expect(item.options.version()).toBe(0);
  await item.options.clock.wait(50);
  expect(item.options.version()).toBe(1);
});


test("notifications during full verification require another complete pass", async () => {
  const item = fixture([2_500]);
  let passes = 0;
  let committed = false;
  await verifyStableBrowserWatcherBaseline({
    ...item.options,
    verify: async () => { passes += 1; await item.options.clock.wait(1_000); },
    commit: () => { committed = true; },
  });
  expect(passes).toBe(2);
  expect(committed).toBe(true);
});

test("repeated notifications for one path still advance the verification generation", async () => {
  const item = fixture();
  const paths = new Set<string>();
  let generation = 0;
  let passes = 0;
  const notify = () => { paths.add("same-runtime-path"); generation += 1; };
  await verifyStableBrowserWatcherBaseline({
    ...item.options,
    version: () => generation,
    verify: async () => { passes += 1; if (passes < 3) notify(); },
    commit: () => { expect(paths.size).toBe(1); },
  });
  expect(generation).toBe(2);
  expect(passes).toBe(3);
});

test("changing verification passes stop at the three-pass ceiling without committing", async () => {
  const item = fixture();
  let generation = 0;
  let committed = false;
  await expect(verifyStableBrowserWatcherBaseline({
    ...item.options,
    version: () => generation,
    verify: async () => { generation += 1; },
    commit: () => { committed = true; },
  })).rejects.toThrow("all three verification passes");
  expect(generation).toBe(3);
  expect(committed).toBe(false);
});

test("a watcher failure during verification is terminal and never committed", async () => {
  const item = fixture();
  const failure = new Error("watcher failed during verification");
  let passes = 0;
  let committed = false;
  await expect(verifyStableBrowserWatcherBaseline({
    ...item.options,
    verify: async () => { passes += 1; item.fail(failure); },
    commit: () => { committed = true; },
  })).rejects.toBe(failure);
  expect(passes).toBe(1);
  expect(committed).toBe(false);
});

test("an identity verification failure is terminal rather than retried", async () => {
  const item = fixture();
  const failure = new Error("saved identity changed");
  let passes = 0;
  let committed = false;
  await expect(verifyStableBrowserWatcherBaseline({
    ...item.options,
    verify: async () => { passes += 1; throw failure; },
    commit: () => { committed = true; },
  })).rejects.toBe(failure);
  expect(passes).toBe(1);
  expect(committed).toBe(false);
});
