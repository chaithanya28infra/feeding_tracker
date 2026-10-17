"use client";
import { useEffect, useRef, useState } from "react";
import { Cloud, CloudOff, RefreshCw } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { loadSync, connectSync, pauseSync, resumeSync } from "@/lib/storage";
import { snapshot, type SyncBinding } from "@/lib/sync-model";
import { validateBackup } from "@/lib/cloud-validation";
import { syncOnce } from "@/lib/sync-engine";
import { syncTransport } from "@/lib/supabase/request";
export function AutomaticSyncStatus() {
  const [label, setLabel] = useState("Saved on device"),
    [error, setError] = useState("");
  const busy = useRef(false);
  useEffect(() => {
    let alive = true;
    const client = getSupabase();
    async function run() {
      if (busy.current) return;
      busy.current = true;
      try {
        const b = await loadSync();
        if (!alive) return;
        if (!b?.enabled) {
          setLabel(
            b?.pending ? "Sync paused · changes on device" : "Saved on device",
          );
          return;
        }
        if (!navigator.onLine) {
          setLabel("Offline · changes on device");
          return;
        }
        if (!client) {
          setLabel("Sign in to sync");
          return;
        }
        const { data } = await client.auth.getSession();
        if (data.session?.user.id !== b.userId) {
          setLabel("Sign in to sync");
          return;
        }
        setLabel("Syncing…");
        const result = await syncOnce(syncTransport());
        if (alive) {
          setError("");
          setLabel(
            result === "synced"
              ? "Synced"
              : result === "conflict"
                ? "Sync needs review"
                : result === "signed-out"
                  ? "Sign in to sync"
                  : "Sync paused",
          );
        }
      } catch (e) {
        if (alive) {
          setError(e instanceof Error ? e.message : "Sync could not connect.");
          setLabel("Sync pending");
        }
      } finally {
        busy.current = false;
      }
    }
    const trigger = () => {
      void run();
    };
    const id = setInterval(trigger, 15000);
    const onVisible = () => {
      if (document.visibilityState === "visible") trigger();
    };
    const auth = client?.auth.onAuthStateChange(() => {
      setTimeout(trigger, 0);
    });
    window.addEventListener("online", trigger);
    document.addEventListener("visibilitychange", onVisible);
    let debounce: ReturnType<typeof setTimeout>;
    const onData = () => {
      clearTimeout(debounce);
      debounce = setTimeout(trigger, 1500);
    };
    window.addEventListener("littlenest-data", onData);
    trigger();
    return () => {
      alive = false;
      clearInterval(id);
      clearTimeout(debounce);
      auth?.data.subscription.unsubscribe();
      window.removeEventListener("online", trigger);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("littlenest-data", onData);
    };
  }, []);
  return (
    <span className="sync-status" title={error || label} aria-live="polite">
      {label === "Synced" ? <Cloud size={15} /> : <CloudOff size={15} />}
      <span>{label}</span>
    </span>
  );
}
export function SyncControls({
  userId,
  babyId,
  request,
  onEnabledChange,
}: {
  userId: string;
  babyId: string;
  request: (path: string) => Promise<any>;
  onEnabledChange: (enabled: boolean) => void;
}) {
  const [binding, setBinding] = useState<SyncBinding | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    const refresh = () =>
      loadSync().then((b) => {
        if (alive) {
          setBinding(b);
          onEnabledChange(!!b?.enabled);
        }
      });
    refresh();
    window.addEventListener("littlenest-data", refresh);
    return () => {
      alive = false;
      window.removeEventListener("littlenest-data", refresh);
    };
  }, [onEnabledChange]);
  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed.");
    } finally {
      setBusy(false);
    }
  }
  const own = binding?.userId === userId;
  return (
    <div className="sync-controls">
      <h3>Automatic sync</h3>
      <p>
        Keep saved feeds, diapers and baby details in sync across devices using
        the same account or your own invited caregiver account. Active timers
        stay on each device.
      </p>
      {binding && !own ? (
        <p>
          Sync is linked to another account. Sign in to that account to resume
          it. Your queued changes stay on this device.
        </p>
      ) : binding?.enabled ? (
        <>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => act(pauseSync)}
          >
            Pause automatic sync
          </button>
          {binding.pending && (
            <p className="muted">Changes are queued safely on this device.</p>
          )}
        </>
      ) : (
        <button
          className="primary"
          disabled={busy || (!binding && !babyId)}
          onClick={() =>
            act(async () => {
              if (binding) {
                await resumeSync(userId);
                return;
              }
              const remote = await request(
                `/api/sync?babyId=${encodeURIComponent(babyId)}`,
              );
              if (!remote.snapshot)
                throw Error("Create a backup for this baby first.");
              const state = validateBackup(remote.snapshot);
              if (!Number.isSafeInteger(remote.revision))
                throw Error("Apply migration 003 before enabling sync.");
              if (
                !confirm(
                  `Connect this device to ${state.baby.name}? Only connect the same baby. Saved entries from both devices will be combined; this device’s entries and baby details win for the initial connection.`,
                )
              )
                return;
              await connectSync(
                userId,
                babyId,
                snapshot(state),
                remote.revision,
              );
            })
          }
        >
          {busy
            ? "Connecting…"
            : binding
              ? "Resume automatic sync"
              : "Enable automatic sync"}
        </button>
      )}
      {!binding && !babyId && (
        <p className="muted">
          Select an existing cloud baby above, or make a backup first.
        </p>
      )}
      {own && binding?.conflict && (
        <div className="sync-conflict" role="alert">
          <h4>Changes need your review</h4>
          <p>
            Both devices changed the same entries. Neither version has been
            overwritten.
          </p>
          <p>
            {binding.conflict.keys.includes("overlapping-feeds")
              ? "Some feeding times overlap. Edit their times in History, then retry."
              : `${binding.conflict.keys.length} conflicting item(s). Choose which version to keep for those items; unrelated changes are combined.`}
          </p>
          <div className="account-actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await syncOnce(syncTransport(), "local");
                })
              }
            >
              Keep this device’s edits
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await syncOnce(syncTransport(), "remote");
                })
              }
            >
              Use cloud edits
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="validation" role="alert">
          {error}
        </p>
      )}
      <hr />
    </div>
  );
}
