"use client";
import { useEffect, useState, type ReactNode } from "react";
import {
  loadState,
  loadSync,
  connectSync,
  saveState,
  getStorageUser,
} from "@/lib/storage";
import { initialState, type State } from "@/lib/model";
import { accountRequest } from "@/lib/supabase/request";
import { setupCloudProfile } from "@/lib/cloud-setup";
import { hasLocalCare, openFamilyBaby, type FamilyBaby } from "@/lib/family";
import { getSupabase } from "@/lib/supabase/client";

export function FamilySetup({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const [ready, setReady] = useState(false),
    [loading, setLoading] = useState(true),
    [local, setLocal] = useState<State>(initialState),
    [babies, setBabies] = useState<FamilyBaby[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [retry, setRetry] = useState(0),
    [profilesChecked, setProfilesChecked] = useState(false);
  const request = (path: string, body?: unknown) =>
    accountRequest(path, body ? "POST" : "GET", body, userId);
  const connect = (
    id: string,
    value: Parameters<typeof connectSync>[2],
    revision: number,
  ) => connectSync(userId, id, value, revision);
  useEffect(() => {
    let alive = true;
    async function open() {
      setLoading(true);
      setError("");
      setProfilesChecked(false);
      try {
        const state = await loadState(),
          binding = await loadSync();
        if (!alive || getStorageUser() !== userId) return;
        setLocal(state);
        if (
          binding?.userId === userId ||
          new URLSearchParams(location.hash.slice(1)).has("caregiver-invite")
        ) {
          setReady(true);
          return;
        }
        const result = await request("/api/cloud");
        if (!alive) return;
        setBabies(result.babies);
        setProfilesChecked(true);
        if (result.babies.length === 1 && !hasLocalCare(state)) {
          await openFamilyBaby(state, result.babies[0].id, {
            request,
            connect,
          });
          if (alive) setReady(true);
        }
      } catch (e) {
        if (alive)
          setError(
            e instanceof Error
              ? e.message
              : "We couldn’t open your account. Please try again.",
          );
      } finally {
        if (alive) setLoading(false);
      }
    }
    void open();
    return () => {
      alive = false;
    };
  }, [userId, retry]);
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      if (getStorageUser() === userId) setReady(true);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "We couldn’t save to your account. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (ready) return children;
  return (
    <section className="family-setup" aria-labelledby="family-title">
      <img
        src="/brand/nest-mark.png"
        width="90"
        height="90"
        alt="Nest Little Baby"
      />
      <p className="eyebrow">WELCOME TO YOUR LITTLE NEST</p>
      <h1 id="family-title">
        {babies.length
          ? "Your family, together."
          : "Let’s meet your little one."}
      </h1>
      {loading ? (
        <p role="status">Opening your family’s tracker…</p>
      ) : (
        <>
          {babies.length ? (
            <>
              <p>
                Choose your baby to open their care history. Future entries save
                automatically.
              </p>
              {hasLocalCare(local) && (
                <p className="muted">
                  This device already has care logs. Only continue with the same
                  baby.
                </p>
              )}
              <div className="family-choices">
                {babies.map((b) => (
                  <button
                    className="secondary"
                    disabled={busy}
                    key={b.id}
                    onClick={() =>
                      void act(async () => {
                        await openFamilyBaby(await loadState(), b.id, {
                          request,
                          connect,
                        });
                      })
                    }
                  >
                    Continue with {b.name}
                  </button>
                ))}
              </div>
            </>
          ) : profilesChecked ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const values = new FormData(e.currentTarget);
                void act(async () => {
                  const state = await loadState();
                  const baby = {
                    ...state.baby,
                    name: String(values.get("name")).trim(),
                    dob: String(values.get("dob")),
                  };
                  await setupCloudProfile(state, baby, {
                    request,
                    connect,
                    saveDetails: async (details) => {
                      if (getStorageUser() !== userId)
                        throw Error(
                          "Your account changed. Please sign in again.",
                        );
                      const save = async () => {
                        const current = await loadState();
                        if (getStorageUser() !== userId)
                          throw Error(
                            "Your account changed. Please sign in again.",
                          );
                        await saveState({ ...current, baby: details.baby });
                      };
                      if (navigator.locks)
                        await navigator.locks.request("littlenest-write", save);
                      else await save();
                      setLocal({ ...state, baby });
                    },
                    created: (id) =>
                      setBabies([
                        {
                          id,
                          name: baby.name,
                          date_of_birth: baby.dob,
                          owner_id: userId,
                        },
                      ]),
                  });
                });
              }}
            >
              <p>
                Just a name and birthday. We’ll take care of saving your
                entries.
              </p>
              <label>
                Baby’s name
                <input
                  name="name"
                  required
                  maxLength={80}
                  defaultValue={
                    local.baby.name === initialState.baby.name
                      ? ""
                      : local.baby.name
                  }
                  placeholder="What do you call your little one?"
                  disabled={busy}
                />
              </label>
              <label>
                Date of birth
                <input
                  name="dob"
                  type="date"
                  required
                  max={new Date().toISOString().slice(0, 10)}
                  defaultValue={local.baby.dob}
                  disabled={busy}
                />
              </label>
              <button className="primary" disabled={busy}>
                {busy ? "Saving…" : "Add your baby"}
              </button>
            </form>
          ) : null}
          {error && (
            <div role="alert" className="family-error">
              <p>
                We couldn’t finish connecting your account. Your device logs are
                still here.
              </p>
              <details>
                <summary>View the error</summary>
                <p>{error}</p>
              </details>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => setRetry((n) => n + 1)}
              >
                Try again
              </button>
            </div>
          )}
          {hasLocalCare(local) && (
            <button
              className="text-button"
              disabled={busy}
              onClick={() => setReady(true)}
            >
              Continue with device logs
            </button>
          )}
          <p className="muted">
            You can invite another parent or caregiver later in Settings.
          </p>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => void getSupabase()?.auth.signOut({ scope: "local" })}
          >
            Sign out
          </button>
        </>
      )}
    </section>
  );
}
