import { authenticate } from "@/lib/supabase/server";
import { validateBackup } from "@/lib/cloud-validation";
import { CloudDatabaseError } from "@/lib/cloud-errors";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
function failure(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Cloud request failed.";
  return Response.json(
    {
      error: message === "UNAUTHORIZED" ? "Please sign in again." : message,
      ...(error instanceof CloudDatabaseError
        ? { code: error.code, step: error.step }
        : {}),
    },
    { status: message === "UNAUTHORIZED" ? 401 : 400, headers },
  );
}
export async function GET(request: Request) {
  try {
    const { db, user } = await authenticate(request),
      id = new URL(request.url).searchParams.get("babyId");
    if (id) {
      const { data, error } = await db
        .from("baby_backups")
        .select("*")
        .eq("baby_id", id)
        .maybeSingle();
      if (error) throw new CloudDatabaseError("load backup", error.code);
      return Response.json({ backup: data }, { headers });
    }
    const { data, error } = await db
      .from("babies")
      .select("id,name,date_of_birth,timezone,owner_id")
      .order("created_at");
    if (error) throw new CloudDatabaseError("load profiles", error.code);
    return Response.json({ babies: data }, { headers });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    const { db, user } = await authenticate(request);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 2_000_000)
      throw Error("Backup is too large. Export a local copy instead.");
    const body = JSON.parse(raw),
      snapshot = validateBackup(body.snapshot);
    let babyId = body.babyId;
    if (babyId) {
      const { data, error } = await db
        .from("babies")
        .select("id")
        .eq("id", babyId)
        .eq("owner_id", user.id)
        .maybeSingle();
      if (error) throw new CloudDatabaseError("check ownership", error.code);
      if (!data) throw Error("You do not own that baby profile.");
    } else {
      const { data, error } = await db
        .from("babies")
        .insert({
          owner_id: user.id,
          name: snapshot.baby.name,
          date_of_birth: snapshot.baby.dob,
          timezone: snapshot.baby.timezone,
          feeding_preferences: snapshot.baby.preferences,
        })
        .select("id")
        .single();
      if (error) throw new CloudDatabaseError("create profile", error.code);
      babyId = data.id;
    }
    const { error } = await db.from("baby_backups").upsert(
      {
        baby_id: babyId,
        user_id: user.id,
        snapshot,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "baby_id" },
    );
    if (error) throw new CloudDatabaseError("save backup", error.code);
    return Response.json({ babyId }, { headers });
  } catch (error) {
    return failure(error);
  }
}
