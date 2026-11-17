"use client";
import { GuideTarget } from "./guide-target";
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
  UserRound,
} from "lucide-react";
import { useWorkspace } from "./workspace-provider";
import {
  MAX_PROFILE_BIO_LENGTH,
  profileErrors,
  profileFieldErrors,
} from "@/lib/model";
import { ro } from "@/i18n/ro";

export function ProfileEditor() {
  const router = useRouter();
  const fileStatusId = useId();
  const [fileName, setFileName] = useState("");
  const { profile, saveProfile, uploadAvatar, notify } = useWorkspace();
  const [form, setForm] = useState(profile);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  useEffect(() => {
    if (!redirecting) return;
    const timer = setTimeout(() => router.push("/panou"), 3000);
    return () => clearTimeout(timer);
  }, [redirecting, router]);
  const t = ro.profile;
  const guideIssues = profileFieldErrors(form);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (uploading || busy || redirecting) return;
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
            <GuideTarget
              id="profile-name"
              field="profile"
              issue={guideIssues.name}
              title="Numele tău"
              description="Numele salvat aici apare în prezentările proprietăților."
            >
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
            </GuideTarget>
            <label>
              {t.agency}
              <input
                autoComplete="organization"
                maxLength={120}
                placeholder="Agenția ta imobiliară"
                value={form.agency}
                onChange={(e) => setForm({ ...form, agency: e.target.value })}
              />
            </label>
            <GuideTarget
              id="profile-email"
              field="profile"
              issue={guideIssues.email}
              title="E-mailul de contact"
              description="Această adresă apare în prezentare. Notificările despre solicitări ajung la adresa contului."
            >
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
            </GuideTarget>
            <GuideTarget
              id="profile-phone"
              field="profile"
              issue={guideIssues.phone}
              title="Telefonul de contact"
              description="Adaugă numărul la care te pot contacta persoanele interesate."
            >
              <label>
                {t.phone}
                <input
                  required
                  type="tel"
                  autoComplete="tel"
                  maxLength={30}
                  placeholder="+40 700 000 000"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </label>
            </GuideTarget>
            <label className="full-width">
              {t.bio}
              <textarea
                rows={4}
                maxLength={MAX_PROFILE_BIO_LENGTH}
                aria-describedby="profile-bio-hint"
                aria-invalid={form.bio.length > MAX_PROFILE_BIO_LENGTH}
                placeholder="Câteva cuvinte despre tine și felul în care lucrezi..."
                value={form.bio}
                onChange={(e) => {
                  setSaved(false);
                  setForm({ ...form, bio: e.target.value });
                }}
              />
              <small id="profile-bio-hint">
                {form.bio.length} / {MAX_PROFILE_BIO_LENGTH} caractere.{" "}
                {form.bio.length > MAX_PROFILE_BIO_LENGTH
                  ? "Scurtează prezentarea înainte de salvare."
                  : "Scrie simplu, personal și sincer."}
              </small>
            </label>
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
            <GuideTarget id="profile-save" inline>
              <button
                className="button primary"
                disabled={busy || uploading || redirecting}
              >
                <Save size={16} />
                {busy ? ro.common.saving : ro.common.save}
              </button>
            </GuideTarget>
          </div>
          {saved && !redirecting && (
            <GuideTarget id="next-property" inline>
              <Link
                className="success-next"
                data-guide-next-property
                href="/panou/proprietati/noua"
              >
                Profilul este pregătit. Adaugă prima proprietate{" "}
                <ArrowRight size={17} />
              </Link>
            </GuideTarget>
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
            <span>{form.agency || "Agenția ta imobiliară"}</span>
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
