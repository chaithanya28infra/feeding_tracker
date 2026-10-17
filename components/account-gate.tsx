"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase/client";
import {
  activateAccount,
  lockStorage,
  startFreshAccount,
  getStorageUser,
} from "@/lib/storage";
import { initialState } from "@/lib/model";
import { CloudAccount } from "@/components/cloud-account";

export function AccountGate({
  children,
}: {
  children: (userId: string) => ReactNode;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [checked, setChecked] = useState(false);
  const [readyUser, setReadyUser] = useState<string | null>(null);
  const [needsImport, setNeedsImport] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const activeUser = useRef<string | null>(null);
  useEffect(() => {
    lockStorage();
    const client = getSupabase();
    if (!client) {
      setChecked(true);
      return;
    }
    const { data } = client.auth.onAuthStateChange((event, next) => {
      if (event === "PASSWORD_RECOVERY") {
        location.replace(`/reset-password${location.hash}`);
        return;
      }
      setSession(next);
      activeUser.current = next?.user.id ?? null;
      setChecked(true);
      // A token refresh for the same account must keep the offline tracker open.
      // Signing out or switching accounts hides it immediately on the next render.
      if (!next || getStorageUser() !== next.user.id) lockStorage();
    });
    return () => data.subscription.unsubscribe();
  }, []);
  const userId = session?.user.id;
  useEffect(() => {
    let alive = true;
    setReadyUser(null);
    setNeedsImport(false);
    setError("");
    lockStorage();
    if (userId)
      activateAccount(
        userId,
        false,
        () => alive && activeUser.current === userId,
      )
        .then((ready) => {
          if (!alive) return;
          if (ready) setReadyUser(userId);
          else setNeedsImport(true);
        })
        .catch(() => {
          if (alive)
            setError(
              "We couldn’t open your device storage. Please reload and try again.",
            );
        });
    return () => {
      alive = false;
    };
  }, [userId]);

  async function choose(importLogs: boolean) {
    if (!userId) return;
    setBusy(true);
    setError("");
    try {
      if (importLogs)
        await activateAccount(
          userId,
          true,
          () => activeUser.current === userId,
        );
      else await startFreshAccount(userId, () => activeUser.current === userId);
      if (activeUser.current !== userId) return;
      setReadyUser(userId);
      setNeedsImport(false);
    } catch {
      setError(
        "Could not open local storage. Your existing logs are preserved. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (userId && readyUser === userId) return children(userId);
  return (
    <main className="welcome-page">
      <section className="welcome-story">
        <img
          src="/brand/nest-mark.png"
          width="160"
          height="160"
          alt="Nest Little Baby"
        />
        <p className="eyebrow">NEST LITTLE BABY</p>
        <h1>
          A little care,
          <br />
          beautifully kept.
        </h1>
        <p>
          A calm place to keep track of feeds, diaper changes, and the little
          moments you share.
        </p>
        <p className="muted">
          Sign in to open your family’s tracker. Once signed in, you can keep
          logging offline on this device.
        </p>
      </section>
      <div className="welcome-account">
        {!checked ? (
          <p role="status">Checking your sign-in…</p>
        ) : !session ? (
          <CloudAccount
            state={initialState}
            onMerge={async () => {}}
            authOnly
          />
        ) : needsImport ? (
          <section aria-labelledby="import-title">
            <h2 id="import-title">Keep your existing device logs?</h2>
            <p>
              This browser has care logs from before account storage was
              introduced. Only import them if they belong to you.
            </p>
            <p>
              Signed in as <strong>{session.user.email}</strong>.
            </p>
            <div className="account-actions">
              <button
                className="primary"
                disabled={busy}
                onClick={() => void choose(true)}
              >
                Import my existing logs
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => void choose(false)}
              >
                Start fresh for this account
              </button>
            </div>
            <p className="muted">
              Starting fresh keeps the original logs preserved separately on
              this device.
            </p>
            <button
              className="text-button"
              disabled={busy}
              onClick={() =>
                void getSupabase()?.auth.signOut({ scope: "local" })
              }
            >
              Use a different account
            </button>
          </section>
        ) : (
          <p role="status">Opening your tracker…</p>
        )}
        {error && (
          <p role="alert" className="validation">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
