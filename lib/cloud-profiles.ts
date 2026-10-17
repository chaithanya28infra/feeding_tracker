import type { SyncBinding } from "./sync-model";

export function preferredCloudProfile(
  profiles: readonly { id: string }[],
  userId: string,
  binding: SyncBinding | null,
): string {
  if (
    binding?.userId === userId &&
    profiles.some((p) => p.id === binding.babyId)
  )
    return binding.babyId;
  return profiles.length === 1 ? profiles[0].id : "";
}
