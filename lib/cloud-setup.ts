import type { State } from "./model";
import { validateBackup } from "./cloud-validation";
import { snapshot, type SyncSnapshot } from "./sync-model";

export async function setupCloudProfile(
  local: State,
  baby: State["baby"],
  actions: {
    saveDetails: (state: State) => Promise<void>;
    request: (
      path: string,
      body?: unknown,
    ) => Promise<{ babyId?: string; snapshot?: unknown; revision?: number }>;
    created: (babyId: string) => void;
    connect: (
      babyId: string,
      value: SyncSnapshot,
      revision: number,
    ) => Promise<unknown>;
  },
) {
  if (local.timer)
    throw Error("Save your active feeding before setting up sync.");
  const backup = validateBackup({ ...local, baby });
  await actions.saveDetails({ ...backup, events: [] });
  const result = await actions.request("/api/cloud", { snapshot: backup });
  if (!result.babyId)
    throw Error(
      "Cloud setup did not return a baby profile. Please refresh profiles before retrying.",
    );
  actions.created(result.babyId);
  const remote = await actions.request(
    `/api/sync?babyId=${encodeURIComponent(result.babyId)}`,
  );
  if (
    !remote.snapshot ||
    !Number.isSafeInteger(remote.revision) ||
    remote.revision! < 1
  )
    throw Error(
      "Your backup is saved, but automatic sync could not start. Please retry Enable automatic sync.",
    );
  await actions.connect(
    result.babyId,
    snapshot(validateBackup(remote.snapshot)),
    remote.revision!,
  );
}
