import { randomBytes, createHash } from "node:crypto";
import { authenticate } from "@/lib/supabase/server";
import { invitationToken, invitationEmail } from "@/lib/invitations";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
function failure(e: unknown) {
  const m = e instanceof Error ? e.message : "Caregiver request failed.";
  return Response.json(
    { error: m === "UNAUTHORIZED" ? "Please sign in first." : m },
    { status: m === "UNAUTHORIZED" ? 401 : 400, headers },
  );
}
export async function GET(request: Request) {
  try {
    const { db, user } = await authenticate(request),
      id = new URL(request.url).searchParams.get("babyId");
    if (!id) throw Error("Choose a cloud baby profile first.");
    const { data: baby, error } = await db
      .from("babies")
      .select("id,owner_id")
      .eq("id", id)
      .maybeSingle();
    if (error || !baby)
      throw Error("This baby is unavailable to your account.");
    const { data: members, error: memberError } = await db.rpc(
      "list_baby_caregivers",
      { target_baby: id },
    );
    if (memberError)
      throw Error("Apply caregiver migration 004 in Supabase SQL Editor.");
    let invites: unknown[] = [];
    if (baby.owner_id === user.id) {
      const result = await db
        .from("caregiver_invites")
        .select("id,invited_email,expires_at,accepted_at,revoked_at")
        .eq("baby_id", id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (result.error) throw Error("Could not load invitations.");
      invites = result.data ?? [];
    }
    return Response.json(
      { members, invites, isOwner: baby.owner_id === user.id },
      { headers },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const { db, user } = await authenticate(request);
    const text = await request.text();
    if (text.length > 4096) throw Error("Request is too large.");
    const body = JSON.parse(text);
    let data, error;
    if (body.action === "profile") {
      if (
        typeof body.name !== "string" ||
        !body.name.trim() ||
        body.name.trim().length > 80
      )
        throw Error("Enter a name up to 80 characters.");
      const result = await db
        .from("profiles")
        .upsert({ id: user.id, display_name: body.name.trim() });
      if (result.error) throw Error("Could not save display name.");
      return Response.json({ ok: true }, { headers });
    }
    if (body.action === "invite") {
      const token = randomBytes(32).toString("hex");
      ({ data, error } = await db.rpc("create_caregiver_invite", {
        target_baby: body.babyId,
        recipient_email: invitationEmail(body.email),
        invite_hash: hash(token),
      }));
      if (error)
        throw Error(
          error.code === "PGRST202"
            ? "Apply caregiver migration 004 first."
            : error.message,
        );
      return Response.json({ token, invite: data?.[0] }, { headers });
    }
    if (body.action === "accept") {
      ({ data, error } = await db.rpc("accept_caregiver_invite", {
        invite_hash: hash(invitationToken(body.token ?? "")),
      }));
    } else if (body.action === "revoke") {
      ({ data, error } = await db.rpc("revoke_caregiver_invite", {
        target_invite: body.inviteId,
      }));
    } else if (body.action === "remove") {
      ({ data, error } = await db.rpc("remove_baby_caregiver", {
        target_baby: body.babyId,
        target_user: body.userId,
      }));
    } else throw Error("Unknown caregiver action.");
    if (error)
      throw Error(
        error.code === "PGRST202"
          ? "Apply caregiver migration 004 first."
          : error.message,
      );
    return Response.json(
      body.action === "accept" ? { babyId: data } : { ok: true },
      { headers },
    );
  } catch (e) {
    return failure(e);
  }
}
