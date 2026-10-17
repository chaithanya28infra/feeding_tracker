"use client";
import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { loadSync, loadState, connectSync, resumeSync } from "@/lib/storage";
import { accountRequest } from "@/lib/supabase/request";
import { openFamilyBaby } from "@/lib/family";
import { CloudAccount } from "@/components/cloud-account";
import { Caregivers } from "@/components/caregivers";
import { FamilySetup } from "@/components/family-setup";
import type { State } from "@/lib/model";

export function FamilySettings({
  userId,
  state,
  onMerge,
}: {
  userId: string;
  state: State;
  onMerge: (s: State) => Promise<void>;
}) {
  const [babyId, setBabyId] = useState(""),
    [email, setEmail] = useState(""),
    [setup, setSetup] = useState(0),
    [paused, setPaused] = useState(false),
    [review, setReview] = useState(false),
    [error, setError] = useState("");
  const [inviteOpen, setInviteOpen] = useState(
    () =>
      typeof location !== "undefined" &&
      location.hash.includes("caregiver-invite"),
  );
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      void loadSync()
        .then((b) => {
          if (alive) {
            setBabyId(b?.userId === userId ? b.babyId : "");
            setPaused(!!b && b.userId === userId && !b.enabled);
            setReview(!!b?.conflict);
          }
        })
        .catch(() => {});
    };
    refresh();
    window.addEventListener("littlenest-data", refresh);
    void getSupabase()
      ?.auth.getSession()
      .then(({ data }) => {
        if (alive && data.session?.user.id === userId)
          setEmail(data.session.user.email ?? "");
      });
    return () => {
      alive = false;
      window.removeEventListener("littlenest-data", refresh);
    };
  }, [userId]);
  const content = (
    <section
      className="family-settings"
      aria-labelledby="family-settings-title"
    >
      <div className="card-heading">
        <div>
          <h2 id="family-settings-title">Your family</h2>
          <p className="muted">{email}</p>
        </div>
        <button
          className="text-button"
          onClick={() =>
            void getSupabase()
              ?.auth.signOut({ scope: "local" })
              .then(({ error }) => {
                if (error) setError(error.message);
              })
          }
        >
          Sign out
        </button>
      </div>
      {!babyId && (
        <div className="family-error">
          <p>
            Your entries are saved on this device. Finish account setup to keep
            them across devices.
          </p>
          <button className="primary" onClick={() => setSetup((n) => n + 1)}>
            Finish account setup
          </button>
        </div>
      )}
      {error && (
        <p className="validation" role="alert">
          {error}
        </p>
      )}
      {paused && (
        <div className="family-error">
          <p>
            Saving to your account is paused. Your device logs are still saved.
          </p>
          <button
            className="primary"
            onClick={() =>
              void resumeSync(userId).catch((e) => setError(e.message))
            }
          >
            Resume saving
          </button>
        </div>
      )}
      {review && (
        <p role="alert" className="validation">
          Two devices changed the same care entries. Review the choices in
          Advanced below before saving continues.
        </p>
      )}
      <details
        open={inviteOpen}
        onToggle={(e) => setInviteOpen(e.currentTarget.open)}
        className="family-disclosure"
      >
        <summary>Invite a caregiver</summary>
        <Caregivers
          userId={userId}
          babyId={babyId}
          onAccepted={async (id) => {
            await openFamilyBaby(await loadState(), id, {
              request: (path) => accountRequest(path, "GET", undefined, userId),
              connect: (id, value, revision) =>
                connectSync(userId, id, value, revision),
            });
            setBabyId(id);
          }}
        />
      </details>
      <details className="family-disclosure" open={review || undefined}>
        <summary>Advanced: backup & recovery</summary>
        <p className="muted">
          Everyday saving happens automatically after setup. Use these tools
          only to recover or export data, pause saving, or manage device copies.
        </p>
        <CloudAccount state={state} onMerge={onMerge} hideCaregivers />
      </details>
    </section>
  );
  return setup ? (
    <FamilySetup key={setup} userId={userId}>
      {content}
    </FamilySetup>
  ) : (
    content
  );
}
