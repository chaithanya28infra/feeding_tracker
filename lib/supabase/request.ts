import { getSupabase } from "./client";
import { getStorageUser } from "../storage";
export async function accountRequest(
  path: string,
  method = "GET",
  body?: unknown,
  expectedUserId = getStorageUser(),
) {
  const client = getSupabase();
  if (!client) throw Error("Supabase is not configured.");
  const { data } = await client.auth.getSession();
  if (!data.session) throw Error("Please sign in again.");
  if (
    expectedUserId !== undefined &&
    (!expectedUserId ||
      data.session.user.id !== expectedUserId ||
      getStorageUser() !== expectedUserId)
  )
    throw Error("Your account changed. Please try again.");
  const response = await fetch(path, {
    method,
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const value = await response.json();
  if (!response.ok)
    throw Error(
      response.status === 409
        ? "Cloud changed during sync. Retrying on the next check."
        : (value.error ?? "Cloud request failed."),
    );
  return value;
}
export function syncTransport() {
  const expectedUserId = getStorageUser();
  return {
    userId: async () => {
      const { data } = await getSupabase()!.auth.getSession();
      return data.session?.user.id ?? null;
    },
    read: (id: string) =>
      accountRequest(
        `/api/sync?babyId=${encodeURIComponent(id)}`,
        "GET",
        undefined,
        expectedUserId,
      ),
    write: (id: string, snapshot: unknown, revision: number) =>
      accountRequest(
        "/api/sync",
        "PUT",
        { babyId: id, snapshot, revision },
        expectedUserId,
      ),
  };
}
