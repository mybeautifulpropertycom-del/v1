"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Brand } from "./brand";
import { photos } from "@/lib/demo";
import { getSupabase } from "@/lib/supabase";

export function Auth({
  resetPassword = false,
  initialMode = "login",
  redirectAuthenticated = false,
  publishListing = false,
}: {
  resetPassword?: boolean;
  initialMode?: "login" | "signup";
  redirectAuthenticated?: boolean;
  publishListing?: boolean;
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
  const destination = publishListing ? "/panou/proprietati/noua" : "/panou";
  useEffect(() => {
    if (!redirectAuthenticated || resetPassword || !supabase) return;
    let active = true;
    void supabase.auth
      .getUser()
      .then(({ data: { user } }) => {
        if (active && user) router.replace(destination);
      })
      .catch(() => {
        /* Keep the login form available if the session cannot be checked. */
      });
    return () => {
      active = false;
    };
  }, [destination, redirectAuthenticated, resetPassword, router, supabase]);
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
        router.replace("/panou");
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          // Keep the existing Supabase allow-list entry; Next redirects it to Romanian.
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setMessage(
          "Dacă există un cont cu acest e-mail, vei primi un link de resetare. Verifică mesajele primite.",
        );
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { name },
            // Existing confirmation links remain allowed and redirect to /panou/profil.
            emailRedirectTo: `${window.location.origin}/dashboard/profile`,
          },
        });
        if (error) throw error;
        if (data.session) router.replace("/panou/profil");
        else
          setMessage(
            "Verifică e-mailul pentru a confirma adresa. Apoi autentifică-te și completează profilul.",
          );
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.replace(destination);
      }
    } catch (e) {
      const code =
        e && typeof e === "object" && "code" in e ? String(e.code) : "";
      const errors: Record<string, string> = {
        invalid_credentials: "Adresa de e-mail sau parola este incorectă.",
        email_not_confirmed:
          "Confirmă adresa de e-mail înainte de autentificare.",
        weak_password: "Alege o parolă mai sigură, de cel puțin 8 caractere.",
        user_already_exists: "Există deja un cont cu această adresă de e-mail.",
        over_email_send_rate_limit:
          "Au fost trimise prea multe e-mailuri. Așteaptă puțin și încearcă din nou.",
        over_request_rate_limit:
          "Prea multe încercări. Așteaptă puțin și încearcă din nou.",
        same_password: "Parola nouă trebuie să fie diferită de cea actuală.",
        otp_expired:
          "Linkul a expirat. Solicită un nou e-mail de confirmare sau resetare.",
      };
      setError(
        errors[code] ||
          "Nu am putut finaliza solicitarea. Verifică datele și conexiunea, apoi încearcă din nou.",
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
        <img src={photos.villa} alt="O locuință modernă, atent amenajată" />
        <Link href="/">
          <Brand light />
        </Link>
        <div>
          <h1>Vinde sau închiriază o proprietate de 10 ori mai repede.</h1>
          <p>
            Vinzi sau închiriezi o proprietate? Îți oferim cea mai eficientă
            modalitate de a o prezenta, promova și vinde.
          </p>
        </div>
        <span className="eyebrow">PENTRU AGENȚI IMOBILIARI ȘI PROPRIETARI</span>
      </div>
      <main className="login-panel">
        <div className="auth-card">
          <h2
            className={
              !resetPassword && supabase && mode === "signup"
                ? "auth-signup-title"
                : undefined
            }
          >
            {resetPassword
              ? "Un nou început."
              : !supabase
                ? "Descoperă aplicația."
                : mode === "signup"
                  ? "Pune proprietatea în valoare"
                  : mode === "forgot"
                    ? "Recuperează accesul la cont."
                    : "Bine ai venit."}
          </h2>
          <p>
            {!supabase
              ? "Descoperă Următoarea Proprietate. Următoarea ta proprietate este la doar câteva clicuri distanță."
              : resetPassword
                ? "Alege o parolă nouă pentru contul tău."
                : mode === "signup"
                  ? "Creează un cont și publică gratuit anunțuri cu fotografii."
                  : mode === "forgot"
                    ? "Introdu adresa de e-mail și îți trimitem un link de resetare a parolei."
                    : "Autentifică-te în contul tău."}
          </p>
          {!supabase ? (
            <div className="auth-demo-note">
              <p>
                Ești în modul demonstrativ. Explorează designurile, editează
                proprietăți și salvează modificările în acest browser. Conturile
                reale și distribuirea publică sunt disponibile după conectarea
                serviciului Supabase.
              </p>
              <Link href={destination} className="button primary full-button">
                Explorează versiunea demo <ArrowRight size={17} />
              </Link>
            </div>
          ) : (
            <form onSubmit={submit}>
              {!resetPassword && mode === "signup" && (
                <label>
                  Nume complet
                  <input
                    required
                    minLength={2}
                    maxLength={100}
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Numele și prenumele tău"
                  />
                </label>
              )}
              {!resetPassword && (
                <label>
                  Adresă de e-mail
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    maxLength={254}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nume@email.ro"
                  />
                </label>
              )}
              {(resetPassword || mode !== "forgot") && (
                <label>
                  Parolă
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
                    placeholder="Cel puțin 8 caractere"
                  />
                </label>
              )}
              {!resetPassword && mode === "login" && (
                <button
                  type="button"
                  className="auth-forgot"
                  onClick={() => changeMode("forgot")}
                >
                  Ai uitat parola?
                </button>
              )}
              <button
                className="button primary full-button"
                disabled={busy || (resetPassword && !recoveryReady)}
              >
                {busy
                  ? "Un moment…"
                  : resetPassword
                    ? "Salvează parola nouă"
                    : mode === "signup"
                      ? "Creează contul"
                      : mode === "forgot"
                        ? "Trimite linkul de resetare"
                        : "Autentificare"}
                <ArrowRight size={16} />
              </button>
              {resetPassword && !recoveryReady && (
                <p className="inline-notice">
                  Deschide linkul de resetare din e-mail pentru a continua.
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
                  Nu ai încă un cont?{" "}
                  <button onClick={() => changeMode("signup")}>
                    Creează un cont
                  </button>
                </>
              ) : (
                <>
                  Ai deja un cont?{" "}
                  <button onClick={() => changeMode("login")}>
                    Autentificare
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        <span className="login-panel-footer">
          O PREZENTARE FRUMOASĂ PENTRU FIECARE PROPRIETATE
        </span>
      </main>
    </div>
  );
}
