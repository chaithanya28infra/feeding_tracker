import {
  loadState,
  loadSync,
  markConflict,
  commitSync,
  getStorageUser,
} from "./storage";
import { snapshot, reconcile, same, type SyncSnapshot } from "./sync-model";
import { validateBackup } from "./cloud-validation";
export type SyncTransport = {
  userId: () => Promise<string | null>;
  read: (babyId: string) => Promise<{ snapshot: unknown; revision: number }>;
  write: (
    babyId: string,
    value: SyncSnapshot,
    revision: number,
  ) => Promise<{ snapshot: unknown; revision: number }>;
};
export async function syncOnce(
  transport: SyncTransport,
  resolve?: "local" | "remote",
) {
  const b = await loadSync();
  if (!b?.enabled) return "paused";
  const sameAccount = () =>
    getStorageUser() === undefined || getStorageUser() === b.userId;
  if ((await transport.userId()) !== b.userId) return "signed-out";
  if (!sameAccount()) return "signed-out";
  if (b.conflict && !resolve) return "conflict";
  const state = await loadState(),
    observed = snapshot(state),
    remote = await transport.read(b.babyId);
  if (!Number.isSafeInteger(remote.revision) || remote.revision < 1)
    throw Error("Apply sync migration 003 first.");
  const remoteState = snapshot(
    validateBackup({
      ...(remote.snapshot as object),
      timer: null,
      dark: false,
    }),
  );
  if (!sameAccount() || (await transport.userId()) !== b.userId)
    return "signed-out";
  if (resolve && b.conflict && b.conflict.revision !== remote.revision) {
    const m = reconcile(b.base, observed, remoteState);
    await markConflict(
      b,
      remoteState,
      remote.revision,
      m.conflicts.length ? m.conflicts : ["cloud-changed"],
    );
    return "conflict";
  }
  if (
    !b.conflict &&
    b.revision === remote.revision &&
    same(observed, remoteState) &&
    same(b.base, remoteState)
  )
    return "synced";
  const m = reconcile(b.base, observed, remoteState, resolve);
  if (
    m.conflicts.includes("overlapping-feeds") ||
    (m.conflicts.length && !resolve)
  ) {
    await markConflict(b, remoteState, remote.revision, m.conflicts);
    return "conflict";
  }
  let accepted = remoteState,
    revision = remote.revision;
  if (!same(m.value, remoteState)) {
    if (!sameAccount()) return "signed-out";
    const result = await transport.write(b.babyId, m.value, remote.revision);
    accepted = snapshot(
      validateBackup({
        ...(result.snapshot as object),
        timer: null,
        dark: false,
      }),
    );
    revision = result.revision;
  }
  if ((await transport.userId()) !== b.userId) return "signed-out";
  if (!sameAccount()) return "signed-out";
  const committed = await commitSync(b, observed, accepted, revision);
  return committed ? "synced" : "conflict";
}
