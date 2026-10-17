import { openDB } from "idb";
import { initialState, type State } from "./model";
import {
  snapshot,
  same,
  reconcile,
  type SyncBinding,
  type SyncSnapshot,
} from "./sync-model";
// Preserve the original database ID and state store during upgrades.
const db = () =>
  openDB("littlenest", 1, {
    upgrade(db) {
      db.createObjectStore("state");
    },
  });
function changed() {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event("littlenest-data"));
}
export async function loadState(): Promise<State> {
  return (await (await db()).get("state", "current")) ?? initialState;
}
export async function saveState(state: State) {
  const d = await db(),
    tx = d.transaction("state", "readwrite");
  await tx.store.put(state, "current");
  const binding = (await tx.store.get("sync")) as SyncBinding | undefined;
  if (binding) {
    const current = snapshot(state);
    binding.pending = same(current, binding.base) ? null : current;
    await tx.store.put(binding, "sync");
  }
  await tx.done;
  changed();
}
export async function loadSync(): Promise<SyncBinding | null> {
  return (await (await db()).get("state", "sync")) ?? null;
}
async function connectSyncUnlocked(
  userId: string,
  babyId: string,
  remote: SyncSnapshot,
  revision: number,
) {
  const d = await db(),
    tx = d.transaction("state", "readwrite");
  const old = (await tx.store.get("sync")) as SyncBinding | undefined;
  if (old && (old.userId !== userId || old.babyId !== babyId)) {
    await tx.done;
    throw Error(
      "This device is already linked to another cloud profile. Export your logs before changing profiles.",
    );
  }
  const local = ((await tx.store.get("current")) as State) ?? initialState;
  if (local.timer) {
    await tx.done;
    throw Error("Save your active feed before connecting sync.");
  }
  const events = new Map(remote.events.map((e) => [e.id, e]));
  for (const e of local.events) events.set(e.id, e);
  const next = {
    ...local,
    baby:
      !local.baby.dob && local.events.length === 0 ? remote.baby : local.baby,
    events: [...events.values()].sort((a, b) => b.start - a.start),
  };
  const current = snapshot(next);
  await tx.store.put(next, "current");
  await tx.store.put(
    {
      userId,
      babyId,
      enabled: true,
      base: remote,
      revision,
      pending: same(current, remote) ? null : current,
    } satisfies SyncBinding,
    "sync",
  );
  await tx.done;
  changed();
  return next;
}
export async function pauseSync() {
  const d = await db(),
    tx = d.transaction("state", "readwrite");
  const b = (await tx.store.get("sync")) as SyncBinding | undefined;
  if (b) await tx.store.put({ ...b, enabled: false }, "sync");
  await tx.done;
  changed();
}
export async function resumeSync(userId: string) {
  const d = await db(),
    tx = d.transaction("state", "readwrite");
  const b = (await tx.store.get("sync")) as SyncBinding | undefined;
  if (!b || b.userId !== userId) {
    await tx.done;
    throw Error("Sign in to the account linked to this device.");
  }
  await tx.store.put({ ...b, enabled: true }, "sync");
  await tx.done;
  changed();
}
export async function markConflict(
  binding: SyncBinding,
  remote: SyncSnapshot,
  revision: number,
  keys: string[],
) {
  const d = await db(),
    tx = d.transaction("state", "readwrite");
  const b = (await tx.store.get("sync")) as SyncBinding | undefined;
  if (b?.enabled && b.userId === binding.userId && b.babyId === binding.babyId)
    await tx.store.put({ ...b, conflict: { remote, revision, keys } }, "sync");
  await tx.done;
  changed();
}
async function commitSyncUnlocked(
  binding: SyncBinding,
  observed: SyncSnapshot,
  remote: SyncSnapshot,
  revision: number,
) {
  const d = await db(),
    tx = d.transaction("state", "readwrite");
  const b = (await tx.store.get("sync")) as SyncBinding | undefined;
  if (
    !b?.enabled ||
    b.userId !== binding.userId ||
    b.babyId !== binding.babyId
  ) {
    await tx.done;
    return null;
  }
  if (b.revision > revision) {
    await tx.done;
    return null;
  }
  const state = ((await tx.store.get("current")) as State) ?? initialState;
  const merged = reconcile(observed, snapshot(state), remote);
  if (merged.conflicts.length) {
    await tx.store.put(
      { ...b, conflict: { remote, revision, keys: merged.conflicts } },
      "sync",
    );
    await tx.done;
    changed();
    return null;
  }
  const next = {
    ...state,
    ...merged.value,
    events: merged.value.events.sort((a, b) => b.start - a.start),
  };
  await tx.store.put(next, "current");
  await tx.store.put(
    {
      ...b,
      base: remote,
      revision,
      pending: same(snapshot(next), remote) ? null : snapshot(next),
      conflict: undefined,
    },
    "sync",
  );
  await tx.done;
  changed();
  return next;
}

async function withStateLock<T>(action: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks)
    return navigator.locks.request("littlenest-write", action);
  return action();
}
export function connectSync(...args: Parameters<typeof connectSyncUnlocked>) {
  return withStateLock(() => connectSyncUnlocked(...args));
}
export function commitSync(...args: Parameters<typeof commitSyncUnlocked>) {
  return withStateLock(() => commitSyncUnlocked(...args));
}
