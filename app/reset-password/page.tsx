"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [mode, setMode] = useState<"checking" | "request" | "update" | "done">(
    "checking",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [configured, setConfigured] = useState(true);

  useEffect(() => {
    const fragment = new URLSearchParams(location.hash.slice(1));
    const invalidLink = fragment.has("error") || fragment.has("error_code");
    const client = getSupabase();
    if (!client) {
      setConfigured(false);
      setMode("request");
      return;
    }
    let mounted = true;
    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (!mounted || invalidLink) return;
      if (event === "PASSWORD_RECOVERY" && session) setMode("update");
      if (event === "SIGNED_OUT") setMode("request");
    });
    client.auth
      .getSession()
      .then(({ data, error }) => {
        if (!mounted) return;
        if (invalidLink || error) {
          setMode("request");
          setError(
            "This reset link has expired or is invalid. Request a new one below.",
          );
        } else {
          setMode(data.session ? "update" : "request");
        }
        // Remove credentials and provider errors from the address bar.
        if (location.hash) history.replaceState(null, "", location.pathname);
      })
      .catch(() => {
        if (!mounted) return;
        setMode("request");
        setError(
          "We couldn’t check your reset link. Please request a new one.",
        );
      });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  async function submit(form: HTMLFormElement) {
    const values = new FormData(form);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const client = getSupabase();
      if (!client)
        throw Error("Password reset is unavailable. Please try again later.");
      if (mode === "update") {
        const password = String(values.get("password"));
        if (password.length < 8 || password.length > 128)
          throw Error("Choose a password between 8 and 128 characters.");
        if (password !== String(values.get("confirm-password")))
          throw Error("The passwords don’t match. Please try again.");
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        form.reset();
        setMode("done");
      } else {
        const { error } = await client.auth.resetPasswordForEmail(
          String(values.get("email")).trim(),
          { redirectTo: `${location.origin}/reset-password` },
        );
        if (error) throw error;
        setMessage(
          "If an account exists for that email, you’ll receive a password reset link. Check your inbox and spam folder.",
        );
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="password-reset">
      <section className="cloud-account" aria-labelledby="reset-title">
        <img
          src="/brand/icon-192.png"
          width="80"
          height="80"
          alt="Nest Little Baby"
        />
        <h1 id="reset-title">
          {mode === "done"
            ? "Your password is updated"
            : mode === "update"
              ? "Choose a new password"
              : "Reset your password"}
        </h1>
        {mode === "checking" ? (
          <p role="status">Checking your reset link…</p>
        ) : !configured ? (
          <p role="alert">
            Password reset is unavailable. Please try again later.
          </p>
        ) : mode === "done" ? (
          <p role="status">
            You can now use your new password to sign in. Your care logs are
            still safe.
          </p>
        ) : (
          <>
            <p>
              {mode === "update"
                ? "Choose a password with at least 8 characters."
                : "Enter your account email and we’ll send you a link to choose a new password."}
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit(e.currentTarget);
              }}
            >
              {mode === "request" ? (
                <label>
                  Email
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={254}
                    disabled={busy}
                  />
                </label>
              ) : (
                <>
                  <label>
                    New password
                    <input
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={8}
                      maxLength={128}
                      disabled={busy}
                    />
                  </label>
                  <label>
                    Confirm new password
                    <input
                      name="confirm-password"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={8}
                      maxLength={128}
                      disabled={busy}
                    />
                  </label>
                </>
              )}
              <div className="account-actions">
                <button className="primary" disabled={busy}>
                  {busy
                    ? "Please wait…"
                    : mode === "request"
                      ? "Send reset link"
                      : "Save new password"}
                </button>
              </div>
            </form>
          </>
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
        <p>
          <a href="/">Back to Nest Little Baby</a>
        </p>
      </section>
    </main>
  );
}
