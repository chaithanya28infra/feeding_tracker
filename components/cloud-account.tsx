"use client";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Cloud, LogOut, RefreshCw } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { SyncControls } from "@/components/automatic-sync";
import { Caregivers } from "@/components/caregivers";
import { validateBackup } from "@/lib/cloud-validation";
import type { State } from "@/lib/model";
import { loadSync } from "@/lib/storage";
import { preferredCloudProfile } from "@/lib/cloud-profiles";
type CloudBaby = {
  id: string;
  name: string;
  date_of_birth: string;
  timezone: string;
  owner_id: string;
};
export function CloudAccount({
  state,
  onMerge,
  authOnly = false,
  hideCaregivers = false,
}: {
  state: State;
  onMerge: (backup: State) => Promise<void>;
  authOnly?: boolean;
  hideCaregivers?: boolean;
}) {
  const [session, setSession] = useState<Session | null>(null),
    [configured, setConfigured] = useState<boolean | null>(null),
    [signup, setSignup] = useState(false),
    [clearOnSignOut, setClearOnSignOut] = useState(false),
    [busy, setBusy] = useState(false),
    [autoActive, setAutoActive] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [babies, setBabies] = useState<CloudBaby[]>([]),
    [profilesLoading, setProfilesLoading] = useState(false),
    [selected, setSelected] = useState("");
  useEffect(() => {
    const client = getSupabase();
    setConfigured(!!client);
    if (!client) return;
    let mounted = true;
    client.auth.getSession().then(({ data, error }) => {
      if (mounted) {
        setSession(data.session);
        if (error)
          setError("Could not restore your sign-in. Please try again.");
      }
    });
    const { data } = client.auth.onAuthStateChange((_event, next) => {
      if (mounted) setSession(next);
    });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);
  async function request(path: string, body?: unknown) {
    const client = getSupabase();
    if (!client) throw Error("Supabase is not configured.");
    const { data } = await client.auth.getSession();
    if (!data.session || data.session.user.id !== session?.user.id)
      throw Error("Your account changed. Please try again.");
    const response = await fetch(path, {
      method: body ? "POST" : "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await response.json();
    if (!response.ok) throw Error(json.error ?? "Cloud request failed.");
    return json;
  }
  async function refresh() {
    const result = await request("/api/cloud");
    const binding = await loadSync();
    setBabies(result.babies);
    setSelected((current) =>
      result.babies.some((b: CloudBaby) => b.id === current)
        ? current
        : preferredCloudProfile(result.babies, session!.user.id, binding),
    );
  }
  useEffect(() => {
    setBabies([]);
    setSelected("");
    setError("");
    let cancelled = false;
    if (session?.user.id && !authOnly) {
      setProfilesLoading(true);
      request("/api/cloud")
        .then(async (result) => {
          const binding = await loadSync();
          if (!cancelled) {
            setBabies(result.babies);
            setSelected(
              preferredCloudProfile(result.babies, session.user.id, binding),
            );
          }
        })
        .catch((e) => {
          if (!cancelled) setError(e.message);
        })
        .finally(() => {
          if (!cancelled) setProfilesLoading(false);
        });
    } else setProfilesLoading(false);
    return () => {
      cancelled = true;
    };
  }, [session?.user.id, authOnly]);
  async function perform(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Connection failed. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="cloud-account" aria-labelledby="account-title">
      <div className="card-heading">
        <h2 id="account-title">
          <Cloud size={21} />{" "}
          {authOnly ? "Welcome to your little nest" : "Account & cloud backup"}
        </h2>
        {session && (
          <button
            className="text-button"
            disabled={busy}
            onClick={() =>
              perform(async () => {
                if (
                  clearOnSignOut &&
                  !confirm(
                    "Remove this account’s care logs and any unsynced changes from this device? Cloud backups stay saved.",
                  )
                )
                  return;
                if (clearOnSignOut) {
                  const { clearAccountData, pauseSync } =
                    await import("@/lib/storage");
                  await pauseSync();
                  await clearAccountData(session.user.id);
                }
                const { error } = await getSupabase()!.auth.signOut({
                  scope: "local",
                });
                if (error) throw error;
                setMessage("Signed out. Care logs remain on this device.");
              })
            }
          >
            <LogOut size={16} />
            Sign out
          </button>
        )}
      </div>
      {configured === null ? (
        <p className="muted">Checking account connection…</p>
      ) : !configured ? (
        <p>
          Account sign-in is temporarily unavailable. Please try again later.
        </p>
      ) : !session ? (
        <>
          <p>
            Sign in or create an account to open your family’s care tracker.
          </p>
          <div
            className="account-mode-switch"
            role="group"
            aria-label="Choose account action"
          >
            <button
              type="button"
              aria-pressed={!signup}
              disabled={busy}
              onClick={() => {
                setSignup(false);
                setError("");
                setMessage("");
              }}
            >
              Sign in
            </button>
            <button
              type="button"
              aria-pressed={signup}
              disabled={busy}
              onClick={() => {
                setSignup(true);
                setError("");
                setMessage("");
              }}
            >
              Create account
            </button>
          </div>
          <h3>{signup ? "Create your parent account" : "Welcome back"}</h3>
          {signup && (
            <p className="muted">
              Choose a password with at least 8 characters. We’ll email you a
              confirmation link.
            </p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget,
                data = new FormData(form),
                email = String(data.get("account-email")).trim(),
                password = String(data.get("account-password"));
              perform(async () => {
                const client = getSupabase()!;
                const result = signup
                  ? await client.auth.signUp({
                      email,
                      password,
                      options: { emailRedirectTo: location.origin },
                    })
                  : await client.auth.signInWithPassword({ email, password });
                if (result.error) throw result.error;
                form.reset();
                setMessage(
                  signup && !result.data.session
                    ? "Check your email to confirm your account, then sign in."
                    : "Signed in. Your local logs have not been uploaded.",
                );
              });
            }}
          >
            <div className="form-grid">
              <label>
                Email
                <input
                  name="account-email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                />
              </label>
              <label>
                Password
                <input
                  name="account-password"
                  type="password"
                  autoComplete={signup ? "new-password" : "current-password"}
                  minLength={signup ? 8 : 1}
                  required
                  maxLength={128}
                />
              </label>
            </div>
            <div className="account-actions">
              <button className="primary" disabled={busy}>
                {busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
              </button>
              {!signup && <a href="/reset-password">Forgot password?</a>}
            </div>
          </form>
        </>
      ) : authOnly ? (
        <p role="status">Opening your tracker…</p>
      ) : (
        <>
          <p>
            Signed in as <strong>{session.user.email}</strong>. Cloud profiles
            are accessible only to their owner and invited caregivers. Manual
            backups upload when you choose <strong>Back up now</strong>; enabled
            sync also uploads automatically.
          </p>
          <label className="signout-option">
            <input
              type="checkbox"
              checked={clearOnSignOut}
              onChange={(e) => setClearOnSignOut(e.target.checked)}
            />
            Remove this account’s device logs when signing out
          </label>
          <label>
            Cloud baby profile
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              disabled={busy || profilesLoading}
            >
              <option value="">
                {profilesLoading
                  ? "Loading cloud profiles…"
                  : babies.length
                    ? "Choose a baby"
                    : "No saved babies yet"}
              </option>
              {babies.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} · {b.date_of_birth}
                  {b.owner_id !== session.user.id ? " · Shared with you" : ""}
                </option>
              ))}
            </select>
          </label>
          {!profilesLoading && babies.length === 0 && (
            <p className="muted">
              Add your baby through account setup before using backup tools.
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
          <SyncControls
            userId={session.user.id}
            babyId={selected}
            request={request}
            onEnabledChange={setAutoActive}
          />
          {autoActive && (
            <p className="muted">
              Automatic sync is managing this device. Pause it before using
              manual backup or restore.
            </p>
          )}
          {selected &&
            babies.find((b) => b.id === selected)?.owner_id !==
              session.user.id && (
              <p className="muted">
                Only the owner can replace a manual backup. Use automatic sync
                to save your care entries for this shared baby.
              </p>
            )}
          <div className="account-actions">
            <button
              className="primary"
              disabled={
                busy ||
                !selected ||
                autoActive ||
                !!state.timer ||
                (!!selected &&
                  babies.find((b) => b.id === selected)?.owner_id !==
                    session.user.id)
              }
              onClick={() =>
                perform(async () => {
                  if (
                    selected &&
                    !confirm(
                      "Replace this baby’s cloud backup with the saved care logs on this device?",
                    )
                  )
                    return;
                  const snapshot = validateBackup(state);
                  const result = await request("/api/cloud", {
                    babyId: selected,
                    snapshot,
                  });
                  setSelected(result.babyId);
                  await refresh();
                  setMessage(
                    "Saved care logs and baby details backed up successfully.",
                  );
                })
              }
            >
              <Cloud size={17} />
              {busy ? "Please wait…" : "Back up now"}
            </button>
            <button
              className="secondary"
              disabled={busy || autoActive || !selected || !!state.timer}
              onClick={() =>
                perform(async () => {
                  const result = await request(
                    `/api/cloud?babyId=${encodeURIComponent(selected)}`,
                  );
                  if (!result.backup)
                    throw Error("No backup is saved for this baby yet.");
                  const backup = validateBackup(result.backup.snapshot);
                  if (
                    !confirm(
                      `Merge ${backup.events.length} saved entries from ${backup.baby.name} into this device? Existing local entries are kept, and baby details will use this backup.`,
                    )
                  )
                    return;
                  await onMerge(backup);
                  setMessage(
                    "Backup merged. Existing local entries were kept.",
                  );
                })
              }
            >
              Restore / merge
            </button>
            <button
              className="icon-button"
              aria-label="Refresh cloud profiles"
              disabled={busy}
              onClick={() => perform(refresh)}
            >
              <RefreshCw size={18} />
            </button>
          </div>
          <p className="muted">
            {state.timer
              ? "Save your active feeding before backing up or restoring. "
              : ""}
            Backups include saved feeds, diapers and baby details. Active timers
            stay on this device. Automatic sync above also works for invited
            caregivers after migration 004. Signing out does not erase device
            logs.
          </p>
        </>
      )}
      {!authOnly && !hideCaregivers && (
        <Caregivers
          userId={session?.user.id ?? null}
          babyId={selected}
          onAccepted={async (id) => {
            await refresh();
            setSelected(id);
          }}
        />
      )}
      {authOnly && error && (
        <p role="alert" className="validation">
          {error}
        </p>
      )}
      {authOnly && message && (
        <p role="status" className="cloud-message">
          {message}
        </p>
      )}
      <hr />
    </section>
  );
}
