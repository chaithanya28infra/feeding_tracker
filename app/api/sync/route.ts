import { authenticate } from "@/lib/supabase/server";
import { validateBackup } from "@/lib/cloud-validation";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
function fail(error: unknown) {
  const m = error instanceof Error ? error.message : "Sync failed.";
  return Response.json(
    { error: m === "UNAUTHORIZED" ? "Please sign in again." : m },
    { status: m === "UNAUTHORIZED" ? 401 : 400, headers },
  );
}
export async function GET(request: Request) {
  try {
    const { db } = await authenticate(request),
      id = new URL(request.url).searchParams.get("babyId");
    if (!id) throw Error("Choose a cloud baby first.");
    const { data, error } = await db
      .from("baby_backups")
      .select("snapshot,revision")
      .eq("baby_id", id)
      .maybeSingle();
    if (error)
      throw Error("Sync needs migration 003. Apply it in Supabase SQL Editor.");
    if (!data)
      return Response.json(
        { error: "Cloud backup is unavailable for this account." },
        { status: 404, headers },
      );
    return Response.json(data, { headers });
  } catch (e) {
    return fail(e);
  }
}
export async function PUT(request: Request) {
  try {
    const { db } = await authenticate(request);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 2000000)
      throw Error("Sync payload is too large. Export a backup.");
    const body = JSON.parse(raw);
    if (
      typeof body.babyId !== "string" ||
      !Number.isSafeInteger(body.revision) ||
      body.revision < 1
    )
      throw Error("Invalid sync revision.");
    const s = validateBackup({ ...body.snapshot, timer: null, dark: false });
    const { data, error } = await db.rpc("save_baby_snapshot", {
      target_baby: body.babyId,
      expected_revision: body.revision,
      new_snapshot: s,
    });
    if (error)
      throw Error(
        "Sync failed. Check access and apply migration 003 if needed.",
      );
    if (!data?.length)
      return Response.json(
        { error: "Cloud data changed. Retrying safely." },
        { status: 409, headers },
      );
    return Response.json(
      { revision: data[0].revision, snapshot: data[0].snapshot ?? s },
      { headers },
    );
  } catch (e) {
    return fail(e);
  }
}
