import { fstatSync, lstatSync, type BigIntStats } from "node:fs";
import { endianness } from "node:os";
import { basename, join } from "node:path";
import { ApplicationError } from "../application/errors";

export interface BrowserWatchIdentity {
  readonly path: string;
  readonly dev: string;
  readonly ino: string;
  readonly mode: number;
  readonly size?: string;
  readonly ctimeNs?: string;
  readonly mtimeNs?: string;
  readonly uid?: string;
  readonly gid?: string;
  readonly nlink?: string;
}

const metadataKeys = ["size", "ctimeNs", "mtimeNs", "uid", "gid", "nlink"] as const;
function matchesIdentity(details: BigIntStats, identity: BrowserWatchIdentity): boolean {
  return details.dev.toString() === identity.dev && details.ino.toString() === identity.ino
    && Number(details.mode & 0o177777n) === identity.mode
    && metadataKeys.every(key => identity[key] === undefined || details[key].toString() === identity[key]);
}

interface WatchTarget {
  readonly absolute: string;
  readonly identity: BrowserWatchIdentity;
  readonly label: string;
  readonly kind: "anchor" | "container" | "payload" | "runtime-root";
}

/** Kernel vnode notes persist until read, including writes whose bytes were restored. */
export async function createBrowserRuntimeKqueue(options: {
  readonly anchor: string;
  readonly anchorIdentity: BrowserWatchIdentity;
  readonly container: string;
  readonly containerIdentity: BrowserWatchIdentity;
  readonly runtimeRoot: string;
  readonly identities: readonly BrowserWatchIdentity[];
}): Promise<{ poll: (mutations: Set<string>) => void; close: () => void }> {
  if (process.platform !== "darwin") throw new ApplicationError("unavailable", "Browser vnode watches require macOS.");
  if (!["arm64", "x64"].includes(process.arch) || endianness() !== "LE") throw new ApplicationError("unavailable", "Unsupported browser vnode watch ABI.");
  const { dlopen, FFIType: T, ptr } = await import("bun:ffi");
  const native = dlopen("/usr/lib/libSystem.B.dylib", {
    kqueue: { args: [], returns: T.i32 },
    kevent64: { args: [T.i32, T.ptr, T.i32, T.ptr, T.i32, T.u32, T.ptr], returns: T.i32 },
    open: { args: [T.ptr, T.i32], returns: T.i32 },
    close: { args: [T.i32], returns: T.i32 },
    fcntl: { args: [T.i32, T.i32, T.i32], returns: T.i32 },
    getrlimit: { args: [T.i32, T.ptr], returns: T.i32 },
    fgetattrlist: { args: [T.i32, T.ptr, T.ptr, T.u64, T.u32], returns: T.i32 },
  });
  const targets: WatchTarget[] = [
    { absolute: options.anchor, identity: options.anchorIdentity, label: "<snapshot-anchor>", kind: "anchor" },
    { absolute: options.container, identity: options.containerIdentity, label: "<snapshot-container>", kind: "container" },
    ...options.identities.map(identity => ({ absolute: identity.path === "." ? options.runtimeRoot : join(options.runtimeRoot, identity.path), identity, label: identity.path, kind: identity.path === "." ? "runtime-root" as const : "payload" as const })),
  ];
  let queue = -1;
  let closed = false;
  let closeFailure: unknown;
  let failure: unknown;
  const descriptors = new Map<number, WatchTarget>();
  const payloadAccess = new Map<number, { atimeNs: bigint; readonly flags: number }>();
  const immutableFlags = (descriptor: number): number => {
    // Darwin attrlist: five attribute groups, requesting only ATTR_CMN_FLAGS.
    const request = Buffer.alloc(24), result = Buffer.alloc(8);
    request.writeUInt16LE(5, 0);
    request.writeUInt32LE(0x00040000, 4);
    if (native.symbols.fgetattrlist(descriptor, ptr(request), ptr(result), 8n, 0) !== 0
      || result.readUInt32LE(0) !== 8) {
      throw new ApplicationError("unavailable", "Browser vnode immutable flags could not be read completely.");
    }
    return result.readUInt32LE(4);
  };
  const close = () => {
    if (closed) { if (closeFailure !== undefined) throw closeFailure; return; }
    // A failed close may already have released its numeric descriptor. Never
    // retry it: the number could belong to a different resource afterwards.
    closed = true;
    let failed = false;
    for (const descriptor of descriptors.keys()) {
      if (native.symbols.close(descriptor) === 0) descriptors.delete(descriptor);
      else failed = true;
    }
    if (queue !== -1) {
      if (native.symbols.close(queue) === 0) queue = -1;
      else failed = true;
    }
    if (failed) {
      closeFailure = new ApplicationError("unavailable", "Browser vnode descriptor collection is unproven.", { unresolvedDescriptors: descriptors.size + (queue === -1 ? 0 : 1) });
      throw closeFailure;
    }
    native.close();
  };
  const reject = (message: string): never => { throw new ApplicationError("conflict", message); };
  try {
    const limits = new BigUint64Array(2);
    // RLIMIT_NOFILE; never modify process or host resource limits.
    if (targets.length > 8192 || native.symbols.getrlimit(8, ptr(limits)) !== 0 || limits[0]! < BigInt(targets.length + 64)) {
      reject("Insufficient bounded descriptor capacity for complete browser vnode watches.");
    }
    queue = native.symbols.kqueue();
    if (queue < 0) reject("Could not create browser vnode event queue.");
    if (native.symbols.fcntl(queue, 2, 1) !== 0) reject("Could not prevent browser vnode queue inheritance.");
    for (const target of targets) {
      const path = Buffer.from(`${target.absolute}\0`);
      // O_EVTONLY | O_SYMLINK | O_CLOEXEC. Symlinks bind their own vnode.
      const descriptor = native.symbols.open(ptr(path), 0x8000 | 0x200000 | 0x1000000);
      if (descriptor < 0) reject(`Could not open browser vnode watch: ${target.label}`);
      descriptors.set(descriptor, target);
      const details = fstatSync(descriptor, { bigint: true });
      const identity = target.identity;
      if (!matchesIdentity(details, identity)) {
        reject(`Browser vnode identity changed before registration: ${target.label}`);
      }
      if (target.kind === "payload" && details.isFile()) {
        payloadAccess.set(descriptor, { atimeNs: details.atimeNs, flags: immutableFlags(descriptor) });
      }
      const change = Buffer.alloc(48);
      const receipt = Buffer.alloc(48);
      change.writeBigUInt64LE(BigInt(descriptor), 0);
      change.writeInt16LE(-4, 8); // EVFILT_VNODE
      change.writeUInt16LE(1 | 0x20 | 0x40, 10); // EV_ADD | EV_CLEAR | EV_RECEIPT
      // Unrelated children of /private/tmp are not this snapshot. Its own
      // replacement/revocation/attribute changes remain observed; container
      // and all payload directories independently retain child-write notes.
      change.writeUInt32LE(target.kind === "anchor" ? 0x69 : 0x7f, 12);
      const count = native.symbols.kevent64(queue, ptr(change), 1, ptr(receipt), 1, 1, null);
      if (count !== 1 || receipt.readBigUInt64LE(0) !== BigInt(descriptor)
        || receipt.readInt16LE(8) !== -4 || !(receipt.readUInt16LE(10) & 0x4000)
        || receipt.readBigInt64LE(16) !== 0n) reject(`Browser vnode registration failed: ${target.label}`);
    }
    return {
      close,
      poll(mutations) {
        if (failure !== undefined) throw failure;
        if (closed) reject("Browser vnode event queue was closed before verification.");
        try {
          // One pending entry per registered vnode; aggregate flags are sticky
          // in the caller before the next read can clear kernel state.
          const output = Buffer.alloc(48 * targets.length);
          const count = native.symbols.kevent64(queue, null, 0, ptr(output), targets.length, 1, null);
          if (count < 0 || count > targets.length) reject("Browser vnode event queue could not be read completely.");
          for (let index = 0; index < count; index += 1) {
            const offset = index * 48;
            const descriptor = Number(output.readBigUInt64LE(offset));
            const target = descriptors.get(descriptor);
            const flags = output.readUInt16LE(offset + 10);
            const notes = output.readUInt32LE(offset + 12);
            if (target === undefined) throw new ApplicationError("conflict", "Browser vnode event has an unknown descriptor.");
            if (output.readInt16LE(offset + 8) !== -4 || flags & (0x4000 | 0x8000) || notes === 0 || notes & ~0x7f) {
              reject("Browser vnode event queue returned an untrusted event.");
            }
            // Preserve the existing launch-managed app-root ATTRIB exception.
            // No WRITE/RENAME/DELETE/LINK combination becomes a metadata event.
            if (target.kind === "runtime-root" && notes === 8) {
              mutations.add(`change:${basename(options.runtimeRoot)}`);
              continue;
            }
            const access = payloadAccess.get(descriptor);
            if (target.kind === "payload" && notes === 8 && access !== undefined
              && (access.flags & 2) !== 0 && metadataKeys.every(key => target.identity[key] !== undefined)) {
              const details = fstatSync(descriptor, { bigint: true });
              const pathDetails = lstatSync(target.absolute, { bigint: true });
              // mmap can emit pure ATTRIB for access-time updates on immutable
              // files. Original ctime and all status identity remain fixed:
              // restored flags, xattrs, permissions, and times still reject.
              // The renderer also retains its full content-manifest checks.
              if (details.isFile() && pathDetails.isFile()
                && matchesIdentity(details, target.identity) && matchesIdentity(pathDetails, target.identity)
                && details.atimeNs > access.atimeNs && pathDetails.atimeNs >= details.atimeNs
                && immutableFlags(descriptor) === access.flags) {
                access.atimeNs = pathDetails.atimeNs;
                continue;
              }
            }
            mutations.add(`vnode-${String(notes)}:${target.label}`);
          }
        } catch (error) { failure = error; throw error; }
      },
    };
  } catch (error) { close(); throw error; }
}
