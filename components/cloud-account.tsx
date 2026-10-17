"use client";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Cloud, LogOut, RefreshCw } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { SyncControls } from "@/components/automatic-sync";
import { Caregivers } from "@/components/caregivers";
import { validateBackup } from "@/lib/cloud-validation";
import type { State } from "@/lib/model";
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
}: {
  state: State;
  onMerge: (backup: State) => Promise<void>;
}) {
  const [session, setSession] = useState<Session | null>(null),
    [configured, setConfigured] = useState<boolean | null>(null),
    [signup, setSignup] = useState(false),
    [busy, setBusy] = useState(false),
    [autoActive, setAutoActive] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [babies, setBabies] = useState<CloudBaby[]>([]),
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
    if (!data.session) throw Error("Please sign in again.");
    const response = await fetch(path, {
      method: body ? "POST" : "GET",
      cache: "no-store",
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
    setBabies(result.babies);
  }
  useEffect(() => {
    setBabies([]);
    setSelected("");
    setError("");
    let cancelled = false;
    if (session?.user.id)
      request("/api/cloud")
        .then((result) => {
          if (!cancelled) setBabies(result.babies);
        })
        .catch((e) => {
          if (!cancelled) setError(e.message);
        });
    return () => {
      cancelled = true;
    };
  }, [session?.user.id]);
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
          <Cloud size={21} /> Account & cloud backup
        </h2>
        {session && (
          <button
            className="text-button"
            disabled={busy}
            onClick={() =>
              perform(async () => {
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
          Add your project URL and publishable key to .env.local to enable
          account sign-in.
        </p>
      ) : !session ? (
        <>
          <p>
            Create an account or sign in to back up saved care logs. Using the
            app without an account still works.
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
      ) : (
        <>
          <p>
            Signed in as <strong>{session.user.email}</strong>. Cloud profiles
            are accessible only to their owner and invited caregivers. Manual
            backups upload when you choose <strong>Back up now</strong>; enabled
            sync also uploads automatically.
          </p>
          <label>
            Cloud baby profile
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              disabled={busy}
            >
              <option value="">Create a new cloud baby profile</option>
              {babies.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} · {b.date_of_birth}
                  {b.owner_id !== session.user.id ? " · Shared with you" : ""}
                </option>
              ))}
            </select>
          </label>
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
                    babyId: selected || undefined,
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
      <Caregivers
        userId={session?.user.id ?? null}
        babyId={selected}
        onAccepted={async (id) => {
          await refresh();
          setSelected(id);
        }}
      />
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
