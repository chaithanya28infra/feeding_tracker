"use client";
import { useEffect, useState } from "react";
import { Users, Copy, UserPlus, X } from "lucide-react";
import { accountRequest } from "@/lib/supabase/request";
import { invitationToken } from "@/lib/invitations";
type Member = {
  user_id: string;
  display_name: string;
  role: "owner" | "caregiver";
};
type Invite = {
  id: string;
  invited_email: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};
export function Caregivers({
  userId,
  babyId,
  onAccepted,
}: {
  userId: string | null;
  babyId: string;
  onAccepted: (id: string) => Promise<void>;
}) {
  const [members, setMembers] = useState<Member[]>([]),
    [invites, setInvites] = useState<Invite[]>([]),
    [owner, setOwner] = useState(false),
    [token, setToken] = useState(""),
    [generated, setGenerated] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    const value = new URLSearchParams(location.hash.slice(1)).get(
      "caregiver-invite",
    );
    if (value) {
      try {
        setToken(invitationToken(value));
        history.replaceState(null, "", location.pathname + location.search);
      } catch (e) {
        setError((e as Error).message);
      }
    }
  }, []);
  useEffect(() => {
    setGenerated("");
    setMembers([]);
    setInvites([]);
    setOwner(false);
    setError("");
    let cancelled = false;
    if (userId && babyId)
      accountRequest(`/api/caregivers?babyId=${encodeURIComponent(babyId)}`)
        .then((result) => {
          if (!cancelled) {
            setMembers(result.members);
            setInvites(result.invites);
            setOwner(result.isOwner);
          }
        })
        .catch((e) => {
          if (!cancelled) setError(e.message);
        });
    return () => {
      cancelled = true;
    };
  }, [userId, babyId]);
  async function refresh() {
    if (!babyId) return;
    const result = await accountRequest(
      `/api/caregivers?babyId=${encodeURIComponent(babyId)}`,
    );
    setMembers(result.members);
    setInvites(result.invites);
    setOwner(result.isOwner);
  }
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Caregiver request failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="caregiver-panel" aria-labelledby="caregiver-title">
      <h3 id="caregiver-title">
        <Users size={20} />
        Caregivers
      </h3>
      <p>
        Share only this baby’s saved care history with another parent or
        caregiver. Each person uses their own account.
      </p>
      <details open={!!token}>
        <summary>Have an invitation? Join a baby’s care team</summary>
        <p className="muted">
          Sign in with the exact email the owner invited. Confirm your email
          first. If you are creating an account, reopen the invitation after
          confirming your email.
        </p>
        <label>
          Invite link or code
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="Paste the invitation link or code"
          />
        </label>
        <button
          type="button"
          className="primary"
          disabled={!userId || busy || !token.trim()}
          onClick={() =>
            act(async () => {
              const result = await accountRequest("/api/caregivers", "POST", {
                action: "accept",
                token: invitationToken(token),
              });
              setToken("");
              await onAccepted(result.babyId);
              setMessage(
                "Invitation accepted. Select the shared baby, restore / merge its history, then enable automatic sync.",
              );
            })
          }
        >
          <UserPlus size={17} />
          Accept invitation
        </button>
        {!userId && (
          <p className="muted">Sign in or create an account above to accept.</p>
        )}
      </details>
      {userId && babyId && (
        <>
          <div className="caregiver-list">
            {members.map((m) => (
              <div className="caregiver-row" key={m.user_id}>
                <span>
                  <strong>
                    {m.display_name}
                    {m.user_id === userId ? " (you)" : ""}
                  </strong>
                  <small>
                    {m.role === "owner" ? "Baby owner" : "Caregiver"}
                  </small>
                </span>
                {owner && m.role === "caregiver" && (
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      act(async () => {
                        if (
                          !confirm(
                            `Remove ${m.display_name} from this baby’s care team? New cloud access will stop. Copies already downloaded to their device cannot be erased remotely.`,
                          )
                        )
                          return;
                        await accountRequest("/api/caregivers", "POST", {
                          action: "remove",
                          babyId,
                          userId: m.user_id,
                        });
                        await refresh();
                        setMessage(
                          "Caregiver removed. New cloud access is blocked.",
                        );
                      })
                    }
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
          {owner && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget,
                  email = String(new FormData(form).get("invite-email"));
                act(async () => {
                  const result = await accountRequest(
                    "/api/caregivers",
                    "POST",
                    { action: "invite", babyId, email },
                  );
                  setGenerated(result.token);
                  form.reset();
                  await refresh();
                  setMessage(
                    "Invite created. It expires in 7 days and can only be accepted once by the invited email.",
                  );
                });
              }}
            >
              <label>
                Caregiver’s email
                <input
                  name="invite-email"
                  type="email"
                  autoComplete="off"
                  maxLength={254}
                  required
                  placeholder="caregiver@example.com"
                />
              </label>
              <button className="primary" disabled={busy}>
                <UserPlus size={17} />
                Create invite link
              </button>
              <p className="muted">
                This grants access to this baby’s existing and future synced
                care history, including notes and baby details. Other babies
                stay private. No email is sent automatically.
              </p>
            </form>
          )}
          {generated && (
            <div className="generated-invite">
              <label>
                Share this invitation privately
                <input
                  readOnly
                  value={
                    typeof window === "undefined"
                      ? ""
                      : `${location.origin}/#caregiver-invite=${generated}`
                  }
                  onFocus={(e) => e.target.select()}
                />
              </label>
              <div className="account-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    act(async () => {
                      await navigator.clipboard.writeText(
                        `${location.origin}/#caregiver-invite=${generated}`,
                      );
                      setMessage(
                        "Invite link copied. Share it privately with the invited person.",
                      );
                    })
                  }
                >
                  <Copy size={16} />
                  Copy link
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    act(async () => {
                      await navigator.clipboard.writeText(generated);
                      setMessage(
                        "Invite code copied. The caregiver can paste it in Settings.",
                      );
                    })
                  }
                >
                  Copy code
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Hide generated invitation"
                  onClick={() => setGenerated("")}
                >
                  <X size={17} />
                </button>
              </div>
              <p className="muted">
                The link is shown only now. If you lose it, revoke this invite
                and create another. Localhost links work only on this computer;
                use a deployed app URL for another device, or share the code.
              </p>
            </div>
          )}
          {owner && invites.length > 0 && (
            <div className="invite-list">
              <h4>Invitations</h4>
              {invites.map((i) => (
                <div className="caregiver-row" key={i.id}>
                  <span>
                    <strong>{i.invited_email}</strong>
                    <small>
                      {i.revoked_at
                        ? "Revoked"
                        : i.accepted_at
                          ? "Accepted"
                          : Date.parse(i.expires_at) <= Date.now()
                            ? "Expired"
                            : `Pending · expires ${new Date(i.expires_at).toLocaleDateString()}`}
                    </small>
                  </span>
                  {!i.revoked_at &&
                    !i.accepted_at &&
                    Date.parse(i.expires_at) > Date.now() && (
                      <button
                        type="button"
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          act(async () => {
                            await accountRequest("/api/caregivers", "POST", {
                              action: "revoke",
                              inviteId: i.id,
                            });
                            setGenerated("");
                            await refresh();
                            setMessage("Invitation revoked.");
                          })
                        }
                      >
                        Revoke
                      </button>
                    )}
                </div>
              ))}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget,
                name = String(new FormData(form).get("caregiver-name"));
              act(async () => {
                await accountRequest("/api/caregivers", "POST", {
                  action: "profile",
                  name,
                });
                form.reset();
                await refresh();
                setMessage("Display name saved for future care entries.");
              });
            }}
          >
            <label>
              Your name on care entries
              <input
                name="caregiver-name"
                required
                maxLength={80}
                placeholder="e.g. Mum, Dad, Alex"
                autoComplete="nickname"
              />
            </label>
            <button className="secondary" disabled={busy}>
              Save display name
            </button>
          </form>
        </>
      )}
      {userId && !babyId && (
        <p className="muted">
          Select a cloud baby profile above to see its care team or create an
          invitation.
        </p>
      )}
      {error && (
        <p role="alert" className="validation">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="cloud-message">
          {message}
        </p>
      )}
      <hr />
    </section>
  );
}
