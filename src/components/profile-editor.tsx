"use client";
import { AgentAvatar } from "./agent-avatar";
import { useEffect, useState } from "react";
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
import { MAX_PROFILE_BIO_LENGTH, profileErrors } from "@/lib/model";
import { en } from "@/i18n/en";

export function ProfileEditor() {
  const router = useRouter();
  const { profile, saveProfile, uploadAvatar, notify } = useWorkspace();
  const [form, setForm] = useState(profile);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  useEffect(() => {
    if (!redirecting) return;
    const timer = setTimeout(() => router.push("/dashboard"), 3000);
    return () => clearTimeout(timer);
  }, [redirecting, router]);
  const t = en.profile;
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
        e instanceof Error ? e.message : "Your profile could not be saved.",
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
        <form className="form-card" onSubmit={submit}>
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
                Profile photo
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={busy || uploading}
                  onChange={async (event) => {
                    const input = event.currentTarget;
                    const file = input.files?.[0];
                    if (!file) return;
                    setUploading(true);
                    setError("");
                    setSaved(false);
                    try {
                      const avatar_url = await uploadAvatar(file);
                      setForm((current) => ({ ...current, avatar_url }));
                    } catch (e) {
                      setError(
                        e instanceof Error
                          ? e.message
                          : "Your photo could not be uploaded.",
                      );
                    } finally {
                      setUploading(false);
                      input.value = "";
                    }
                  }}
                />
              </label>
              <small>
                {uploading
                  ? "Uploading your photo…"
                  : "JPG, PNG or WebP, up to 10 MB. Save changes to update your photo everywhere."}
              </small>
              {form.avatar_url && (
                <button
                  type="button"
                  className="text-button"
                  disabled={busy || uploading}
                  onClick={() => {
                    setForm((current) => ({ ...current, avatar_url: "" }));
                    setSaved(false);
                  }}
                >
                  Remove photo
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
                placeholder="Olivia Bennett"
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
                autoComplete="organization"
                maxLength={120}
                placeholder="Your brokerage"
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
                placeholder="you@youragency.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
            <label>
              {t.phone}
              <input
                required
                type="tel"
                autoComplete="tel"
                maxLength={30}
                placeholder="+1 (212) 555-0100"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </label>
            <label className="full-width">
              {t.bio}
              <textarea
                rows={4}
                maxLength={MAX_PROFILE_BIO_LENGTH}
                aria-describedby="profile-bio-hint"
                aria-invalid={form.bio.length > MAX_PROFILE_BIO_LENGTH}
                placeholder="A few words about you and your approach to finding the perfect home…"
                value={form.bio}
                onChange={(e) => {
                  setSaved(false);
                  setForm({ ...form, bio: e.target.value });
                }}
              />
              <small id="profile-bio-hint">
                {form.bio.length} / {MAX_PROFILE_BIO_LENGTH} characters.{" "}
                {form.bio.length > MAX_PROFILE_BIO_LENGTH
                  ? "Please shorten your introduction before saving."
                  : "Keep it warm, personal, and true to you."}
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
              Your public contact details
            </span>
            <button
              className="button primary"
              disabled={busy || uploading || redirecting}
            >
              <Save size={16} />
              {busy ? en.common.saving : en.common.save}
            </button>
          </div>
          {redirecting && (
            <p role="status">
              Your profile is saved. Taking you to My properties in 3 seconds…
            </p>
          )}
          {saved && !redirecting && (
            <Link className="success-next" href="/dashboard/properties/new">
              Your profile is ready. Add your first property{" "}
              <ArrowRight size={17} />
            </Link>
          )}
        </form>
        <aside>
          <div className="profile-preview">
            <span className="eyebrow">A FAMILIAR FACE ON EVERY PAGE</span>
            <div className="profile-preview-avatar">
              <AgentAvatar profile={form} />
            </div>
            <h2>{form.name || "Your name here"}</h2>
            <span>{form.agency || "Your brokerage"}</span>
            <p>{form.bio || "Your personal introduction will appear here."}</p>
            <div className="preview-contact">
              <span>
                <Mail size={16} />
                {form.email || "you@youragency.com"}
              </span>
              <span>
                <Phone size={16} />
                {form.phone || "Your phone number"}
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
