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
let storageUser: string | null | undefined;
export const getStorageUser = () => storageUser;
export function lockStorage() {
  storageUser = null;
}
const openStore = (name: string) =>
  openDB(name, 1, {
    upgrade(db) {
      db.createObjectStore("state");
    },
  });
const accountStore = (userId: string) =>
  openStore(`littlenest-account-${userId}`);
const db = () => {
  if (storageUser === null) throw Error("Sign in to access care logs.");
  return storageUser ? accountStore(storageUser) : openStore("littlenest");
};

// The original database remains intact for upgrades. Unlinked logs require an
// explicit import; a sync binding or prior claim identifies their owning account.
export async function activateAccount(
  userId: string,
  importLegacy = false,
  isCurrent = () => true,
) {
  return withStateLock(async () => {
    if (!isCurrent()) return false;
    const target = await accountStore(userId);
    if (!(await target.get("state", "account-initialized"))) {
      const legacy = await openStore("littlenest");
      const state = (await legacy.get("state", "current")) as State | undefined;
      const binding = (await legacy.get("state", "sync")) as
        SyncBinding | undefined;
      const owner = (await legacy.get("state", "legacy-owner")) as
        string | undefined;
      const hasLogs =
        !!state &&
        (!!state.timer ||
          !!state.baby.dob ||
          !!state.events.length ||
          state.baby.name !== initialState.baby.name);
      const owned = (binding?.userId ?? owner) === userId;
      const unclaimed = !binding && !owner && hasLogs;
      if (unclaimed && !importLegacy) return false;
      if (owned || (unclaimed && importLegacy)) {
        await legacy.put("state", userId, "legacy-owner");
        const tx = target.transaction("state", "readwrite");
        if (state) await tx.store.put(state, "current");
        if (binding) await tx.store.put(binding, "sync");
        await tx.store.put(true, "account-initialized");
        await tx.done;
      } else {
        await target.put("state", true, "account-initialized");
      }
    }
    if (!isCurrent()) return false;
    storageUser = userId;
    return true;
  });
}
export async function startFreshAccount(
  userId: string,
  isCurrent = () => true,
) {
  await withStateLock(async () => {
    if (!isCurrent()) return;
    const target = await accountStore(userId);
    await target.put("state", true, "account-initialized");
    if (isCurrent()) storageUser = userId;
  });
}
export async function clearAccountData(userId: string) {
  await withStateLock(async () => {
    const target = await accountStore(userId);
    const tx = target.transaction("state", "readwrite");
    await tx.store.clear();
    await tx.store.put(true, "account-initialized");
    await tx.done;
    // Also remove the upgrade copy if it belongs to this account.
    const legacy = await openStore("littlenest");
    const old = legacy.transaction("state", "readwrite");
    const binding = (await old.store.get("sync")) as SyncBinding | undefined;
    const owner = (await old.store.get("legacy-owner")) as string | undefined;
    if ((binding?.userId ?? owner) === userId) {
      await old.store.delete("current");
      await old.store.delete("sync");
    }
    await old.done;
  });
}
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
  if (storageUser !== undefined && storageUser !== userId)
    throw Error("Your account changed. Please sign in again.");
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
