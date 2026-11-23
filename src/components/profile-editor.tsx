"use client";
import { AgentAvatar } from "./agent-avatar";
import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Globe2,
  Mail,
  Phone,
  Save,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useWorkspace } from "./workspace-provider";
import { MAX_PROFILE_BIO_LENGTH, profileErrors } from "@/lib/model";
import { requestProfileBio } from "@/lib/profile-bio-client";
import {
  isProfileBioRole,
  profileBioRoles,
  type ProfileBioRole,
} from "@/lib/profile-bio";
import { ro } from "@/i18n/ro";

export function ProfileEditor() {
  const router = useRouter();
  const fileStatusId = useId();
  const [fileName, setFileName] = useState("");
  const { profile, saveProfile, uploadAvatar, notify, demo } = useWorkspace();
  const [form, setForm] = useState(profile);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [bioRole, setBioRole] = useState<ProfileBioRole>("agent");
  const [remaining, setRemaining] = useState<number | null>(null);
  const [generatingBio, setGeneratingBio] = useState(false);
  const [bioError, setBioError] = useState("");
  const bioTooLong =
    form.bio !== profile.bio && form.bio.length > MAX_PROFILE_BIO_LENGTH;
  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    void requestProfileBio(
      undefined,
      AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]),
    )
      .then(({ remaining: count }) => {
        if (!controller.signal.aborted && count !== undefined)
          setRemaining((current) => Math.min(current ?? count, count));
      })
      .catch(() => {
        // A failed quota check leaves manual editing and generation available.
      });
    return () => controller.abort();
  }, [demo, profile.id]);
  useEffect(() => {
    if (!redirecting) return;
    const timer = setTimeout(() => router.push("/panou"), 3000);
    return () => clearTimeout(timer);
  }, [redirecting, router]);
  const t = ro.profile;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (uploading || busy || generatingBio || redirecting) return;
    setError("");
    const errors = profileErrors(form);
    if (errors.length) {
      setError(errors.join(" "));
      return;
    }
    setBusy(true);
    try {
      const firstCompletion =
        !profile.profile_completed_at && profileErrors(profile).length > 0;
      await saveProfile(form);
      notify(t.saved);
      setSaved(true);
      if (firstCompletion) setRedirecting(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Profilul nu a putut fi salvat.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function generateBio() {
    if (generatingBio || busy || uploading || redirecting || remaining === 0)
      return;
    setGeneratingBio(true);
    setBioError("");
    try {
      const result = await requestProfileBio({
        role: bioRole,
        agency: form.agency,
        previousBio: form.bio.slice(0, 1000),
      });
      if (result.remaining !== undefined) setRemaining(result.remaining);
      if (result.error) throw new Error(result.error);
      const bio = result.bio;
      if (!bio || bio.length > MAX_PROFILE_BIO_LENGTH)
        throw new Error("Prezentarea generată nu a putut fi citită.");
      setForm((current) => ({ ...current, bio }));
      setSaved(false);
    } catch (error) {
      setBioError(
        error instanceof Error && error.name === "Error"
          ? error.message
          : "Prezentarea nu a putut fi generată. Încearcă din nou.",
      );
    } finally {
      setGeneratingBio(false);
    }
  }
  return (
    <>
      <div className="page-heading compact">
        <div>
          <span className="eyebrow">{t.eyebrow}</span>
          <h1>{t.title}</h1>
          <p>{t.intro}</p>
        </div>
      </div>
      <div className="profile-layout">
        <form className="form-card" data-guide-contact onSubmit={submit}>
          <div className="form-card-heading">
            <span className="section-icon">
              <UserRound size={22} />
            </span>
            <div>
              <h2>{t.contactTitle}</h2>
              <p>{t.contactDescription}</p>
            </div>
          </div>
          <div className="profile-photo-control">
            <span className="profile-upload-avatar">
              <AgentAvatar profile={form} />
            </span>
            <div>
              <label>
                Fotografie de profil
                <span className="localized-file-control">
                  <input
                    className="localized-file-input"
                    aria-label="Fotografie de profil"
                    aria-describedby={fileStatusId}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={busy || uploading}
                    onChange={async (event) => {
                      const input = event.currentTarget;
                      const file = input.files?.[0];
                      if (!file) return;
                      setFileName(file.name);
                      setUploading(true);
                      setError("");
                      setSaved(false);
                      try {
                        const avatar_url = await uploadAvatar(file);
                        setForm((current) => ({ ...current, avatar_url }));
                      } catch (e) {
                        setFileName("");
                        setError(
                          e instanceof Error
                            ? e.message
                            : "Fotografia nu a putut fi încărcată.",
                        );
                      } finally {
                        setUploading(false);
                        input.value = "";
                      }
                    }}
                  />
                  <span className="localized-file-button" aria-hidden="true">
                    Alege Imaginea
                  </span>
                  <span
                    className="localized-file-name"
                    id={fileStatusId}
                    aria-live="polite"
                  >
                    {fileName || "Niciun fișier selectat"}
                  </span>
                </span>
              </label>
              <small>
                {uploading
                  ? "Se încarcă fotografia…"
                  : "JPG, PNG sau WebP, maximum 10 MB. Salvează modificările pentru a actualiza fotografia."}
              </small>
              {form.avatar_url && (
                <button
                  type="button"
                  className="text-button"
                  disabled={busy || uploading}
                  onClick={() => {
                    setForm((current) => ({ ...current, avatar_url: "" }));
                    setFileName("");
                    setSaved(false);
                  }}
                >
                  Elimină fotografia
                </button>
              )}
            </div>
          </div>
          <div className="field-grid">
            <label>
              {t.name}
              <input
                required
                autoComplete="name"
                maxLength={100}
                placeholder="Numele tău"
                value={form.name}
                onChange={(e) => {
                  setSaved(false);
                  setForm({ ...form, name: e.target.value });
                }}
              />
            </label>
            <label>
              {t.agency}
              <input
                data-profile-guide-field="agency"
                autoComplete="organization"
                maxLength={120}
                placeholder="Agenția ta imobiliară"
                value={form.agency}
                onChange={(e) => setForm({ ...form, agency: e.target.value })}
              />
            </label>
            <label>
              {t.email}
              <input
                required
                type="email"
                autoComplete="email"
                maxLength={254}
                placeholder="nume@email.ro"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
            <label>
              {t.phone}
              <input
                data-profile-guide-field="phone"
                data-guide-issue={
                  form.phone.replace(/\D/g, "").length < 8
                    ? "Adaugă un număr de telefon valid."
                    : undefined
                }
                required
                type="tel"
                autoComplete="tel"
                maxLength={30}
                placeholder="+40 700 000 000"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </label>
            <div className="full-width">
              <label>
                {t.bio}
                <textarea
                  data-profile-guide-field="bio"
                  data-guide-issue={
                    bioTooLong
                      ? "Scurtează prezentarea înainte de salvare."
                      : undefined
                  }
                  rows={4}
                  maxLength={MAX_PROFILE_BIO_LENGTH}
                  aria-describedby="profile-bio-hint"
                  aria-invalid={bioTooLong}
                  readOnly={generatingBio}
                  placeholder="Câteva cuvinte despre tine și felul în care lucrezi..."
                  value={form.bio}
                  onChange={(e) => {
                    setSaved(false);
                    setForm({ ...form, bio: e.target.value });
                  }}
                />
              </label>
              <small id="profile-bio-hint">
                {form.bio.length} / {MAX_PROFILE_BIO_LENGTH} caractere.{" "}
                {bioTooLong
                  ? "Scurtează prezentarea înainte de salvare."
                  : form.bio.length > MAX_PROFILE_BIO_LENGTH
                    ? "Poți păstra textul actual. Un text nou poate avea cel mult 300 de caractere."
                    : "Scrie simplu, personal și sincer."}
              </small>
              <div className="profile-bio-actions">
                <label>
                  Tipul prezentării
                  <select
                    value={bioRole}
                    disabled={generatingBio}
                    onChange={(event) => {
                      if (isProfileBioRole(event.target.value))
                        setBioRole(event.target.value);
                    }}
                  >
                    {Object.entries(profileBioRoles).map(([role, label]) => (
                      <option key={role} value={role}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => void generateBio()}
                  disabled={
                    demo ||
                    generatingBio ||
                    busy ||
                    uploading ||
                    redirecting ||
                    remaining === 0
                  }
                >
                  <Sparkles size={16} />
                  {generatingBio
                    ? "Generăm descrierea…"
                    : "Generează descrierea"}
                </button>
              </div>
              <p className="profile-bio-status" aria-live="polite">
                {demo
                  ? "Generarea AI este disponibilă după autentificare."
                  : remaining === 0
                    ? "Ai folosit toate cele trei generări AI. Poți edita textul."
                    : remaining === 1
                      ? "Mai ai o generare AI."
                      : remaining !== null
                        ? `Mai ai ${remaining} generări AI.`
                        : "Până la trei generări AI."}
              </p>
              {bioError && (
                <p className="form-error" role="alert">
                  {bioError}
                </p>
              )}
            </div>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <span>
              <ShieldCheck size={15} />
              Datele tale publice de contact
            </span>
            <button
              data-guide-profile-save
              className="button primary"
              disabled={busy || uploading || generatingBio || redirecting}
            >
              <Save size={16} />
              {busy ? ro.common.saving : ro.common.save}
            </button>
          </div>
          {saved && !redirecting && (
            <Link
              className="success-next"
              data-guide-next-property
              href="/panou/proprietati/noua"
            >
              Profilul este pregătit. Adaugă prima proprietate{" "}
              <ArrowRight size={17} />
            </Link>
          )}
        </form>
        <aside>
          <div className="profile-preview">
            <span className="eyebrow">
              O PREZENȚĂ FAMILIARĂ PE FIECARE PAGINĂ
            </span>
            <div className="profile-preview-avatar">
              <AgentAvatar profile={form} />
            </div>
            <h2>{form.name || "Numele tău aici"}</h2>
            {form.agency.trim() && <span>{form.agency}</span>}
            <p>{form.bio || "Prezentarea ta va apărea aici."}</p>
            <div className="preview-contact">
              <span>
                <Mail size={16} />
                {form.email || "nume@email.ro"}
              </span>
              <span>
                <Phone size={16} />
                {form.phone || "Numărul tău de telefon"}
              </span>
            </div>
          </div>
          <div className="sync-note">
            <Globe2 size={22} />
            <div>
              <strong>{t.sync}</strong>
              <p>{t.syncDescription}</p>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
