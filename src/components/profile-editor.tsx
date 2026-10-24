"use client";
import { useState } from "react";
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
import { profileErrors } from "@/lib/model";
import { en } from "@/i18n/en";

export function ProfileEditor() {
  const { profile, saveProfile, notify } = useWorkspace();
  const [form, setForm] = useState(profile);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const t = en.profile;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const errors = profileErrors(form);
    if (errors.length) {
      setError(errors.join(" "));
      return;
    }
    setBusy(true);
    try {
      await saveProfile(form);
      notify(t.saved);
      setSaved(true);
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
                maxLength={1000}
                placeholder="A few words about you and your approach to finding the perfect home…"
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
              />
              <small>Keep it warm, personal, and true to you.</small>
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
            <button className="button primary" disabled={busy}>
              <Save size={16} />
              {busy ? en.common.saving : en.common.save}
            </button>
          </div>
          {saved && (
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
              {form.name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("") || "YOU"}
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
