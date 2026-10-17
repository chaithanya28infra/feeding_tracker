import type { State } from "./model";
import { validateBackup } from "./cloud-validation";
import { snapshot, type SyncSnapshot } from "./sync-model";

export type FamilyBaby = {
  id: string;
  name: string;
  date_of_birth: string;
  owner_id: string;
};
export function hasLocalCare(state: State) {
  return !!state.baby.dob || !!state.timer || state.events.length > 0;
}
export async function openFamilyBaby(
  local: State,
  id: string,
  actions: {
    request: (
      path: string,
    ) => Promise<{ snapshot?: unknown; revision?: number }>;
    connect: (
      id: string,
      state: SyncSnapshot,
      revision: number,
    ) => Promise<unknown>;
  },
) {
  if (local.timer)
    throw Error("Save your active feeding before connecting another device.");
  const remote = await actions.request(
    `/api/sync?babyId=${encodeURIComponent(id)}`,
  );
  if (
    !remote.snapshot ||
    !Number.isSafeInteger(remote.revision) ||
    remote.revision! < 1
  )
    throw Error(
      "This baby’s saved history is not available yet. Please try again.",
    );
  const saved = validateBackup(remote.snapshot);
  if (
    hasLocalCare(local) &&
    (local.baby.name !== saved.baby.name || local.baby.dob !== saved.baby.dob)
  )
    throw Error(
      "The baby details on this device differ from this account. Keep using this device and review the details in Settings before combining logs.",
    );
  await actions.connect(id, snapshot(saved), remote.revision!);
}
