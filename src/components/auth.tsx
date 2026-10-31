"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Brand } from "./shell";
import { photos } from "@/lib/demo";
import { getSupabase } from "@/lib/supabase";

export function Auth({
  resetPassword = false,
  initialMode = "login",
}: {
  resetPassword?: boolean;
  initialMode?: "login" | "signup";
}) {
  const [mode, setMode] = useState<"login" | "signup" | "forgot">(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [recoveryReady, setRecoveryReady] = useState(false);
  const router = useRouter();
  const supabase = getSupabase();
  useEffect(() => {
    if (!resetPassword || !supabase) return;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (
        (event === "PASSWORD_RECOVERY" || event === "INITIAL_SESSION") &&
        session
      )
        setRecoveryReady(true);
    });
    return () => subscription.unsubscribe();
  }, [resetPassword, supabase]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (resetPassword) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        router.replace("/dashboard");
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setMessage(
          "If an account exists for this email, a reset link is on its way. Check your inbox.",
        );
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { name },
            emailRedirectTo: `${window.location.origin}/dashboard/profile`,
          },
        });
        if (error) throw error;
        if (data.session) router.replace("/dashboard/profile");
        else
          setMessage(
            "Check your inbox to confirm your email. Then sign in and make your profile yours.",
          );
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.replace("/dashboard");
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "We couldn’t complete that request. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  function changeMode(next: typeof mode) {
    setMode(next);
    setError("");
    setMessage("");
  }
  return (
    <div className="login-layout">
      <div className="login-visual">
        <img src={photos.villa} alt="A thoughtfully designed modern home" />
        <Link href="/">
          <Brand light />
        </Link>
        <div>
          <h1>
            Sell your property 10x faster
            <br />
            <em>using the new app.</em>
          </h1>
          <p>
            Create beautiful property funnels and walkthrough videos that make
            the right first impression.
          </p>
        </div>
        <span className="eyebrow">
          BUILT FOR AGENTS. MADE FOR BEAUTIFUL HOMES.
        </span>
      </div>
      <main className="login-panel">
        <div className="auth-card">
          <span className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</span>
          <h2>
            {resetPassword
              ? "A fresh start."
              : !supabase
                ? "Take a look around."
                : mode === "signup"
                  ? "Make yourself at home."
                  : mode === "forgot"
                    ? "Let’s get you back in."
                    : "Welcome home."}
          </h2>
          <p>
            {!supabase
              ? "Explore the first edition of My Beautiful Property. Your next beautiful listing is just a few clicks away."
              : resetPassword
                ? "Choose a new password for your account."
                : mode === "signup"
                  ? "Create your account. We’ll save a beautiful space for you."
                  : mode === "forgot"
                    ? "Enter your email and we’ll send a password reset link."
                    : "Sign in to your workspace and pick up where you left off."}
          </p>
          {!supabase ? (
            <div className="auth-demo-note">
              <p>
                You’re in demo mode. Explore the designs, edit properties, and
                save changes in this browser. Real accounts and public sharing
                will be available once Supabase is connected.
              </p>
              <Link href="/dashboard" className="button primary full-button">
                Explore the demo <ArrowRight size={17} />
              </Link>
            </div>
          ) : (
            <form onSubmit={submit}>
              {!resetPassword && mode === "signup" && (
                <label>
                  Full name
                  <input
                    required
                    minLength={2}
                    maxLength={100}
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Olivia Bennett"
                  />
                </label>
              )}
              {!resetPassword && (
                <label>
                  Email address
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    maxLength={254}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@youragency.com"
                  />
                </label>
              )}
              {(resetPassword || mode !== "forgot") && (
                <label>
                  Password
                  <input
                    type="password"
                    required
                    minLength={8}
                    autoComplete={
                      resetPassword || mode === "signup"
                        ? "new-password"
                        : "current-password"
                    }
                    value={password}
                    maxLength={128}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                  />
                </label>
              )}
              {!resetPassword && mode === "login" && (
                <button
                  type="button"
                  className="auth-forgot"
                  onClick={() => changeMode("forgot")}
                >
                  Forgot your password?
                </button>
              )}
              <button
                className="button primary full-button"
                disabled={busy || (resetPassword && !recoveryReady)}
              >
                {busy
                  ? "One moment…"
                  : resetPassword
                    ? "Save new password"
                    : mode === "signup"
                      ? "Create my account"
                      : mode === "forgot"
                        ? "Send reset link"
                        : "Sign in"}
                <ArrowRight size={16} />
              </button>
              {resetPassword && !recoveryReady && (
                <p className="inline-notice">
                  Open the reset link from your email to continue.
                </p>
              )}
            </form>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="auth-message" role="status">
              {message}
            </p>
          )}
          {supabase && !resetPassword && (
            <div className="auth-switch">
              {mode === "login" ? (
                <>
                  New around here?{" "}
                  <button onClick={() => changeMode("signup")}>
                    Create an account
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button onClick={() => changeMode("login")}>Sign in</button>
                </>
              )}
            </div>
          )}
        </div>
        <span className="login-panel-footer">
          A BEAUTIFUL PLACE FOR EVERY PROPERTY.
        </span>
      </main>
    </div>
  );
}
