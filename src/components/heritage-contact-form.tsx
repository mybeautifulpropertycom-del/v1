"use client";

import { useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, Check } from "lucide-react";
import { presentationCopy } from "@/lib/presentation-copy";

export function HeritageContactForm({
  slug,
  agentName,
  preview,
}: {
  slug: string;
  agentName: string;
  preview: boolean;
}) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    message: "",
    website: "",
  });
  const [feedback, setFeedback] = useState<{
    text: string;
    error: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const sending = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current || sent) return;
    if (preview) {
      setFeedback({
        text: "Aceasta este o previzualizare. Nu a fost trimis niciun mesaj.",
        error: false,
      });
      return;
    }
    sending.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, slug }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.success !== true)
        throw new Error(
          data?.error ||
            "Mesajul nu a putut fi trimis. Încearcă din nou sau contactează direct agentul.",
        );
      setSent(true);
      setFeedback({
        text: "Mesajul a ajuns la agent. Te poate contacta folosind datele pe care le-ai oferit.",
        error: false,
      });
    } catch (error) {
      setFeedback({
        text:
          error instanceof TypeError
            ? "Nu am putut trimite mesajul. Verifică conexiunea și încearcă din nou."
            : error instanceof Error
              ? error.message
              : "Mesajul nu a putut fi trimis.",
        error: true,
      });
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return (
    <form
      className="heritage-inquiry"
      onSubmit={submit}
      aria-labelledby="heritage-inquiry-title"
    >
      <h3 id="heritage-inquiry-title" className="presentation-inquiry-heading">
        {presentationCopy.inquiry.title}
      </h3>
      <p>{presentationCopy.inquiry.subtitle}</p>
      <div className="heritage-field-pair">
        <label>
          Numele tău
          <input
            required
            name="name"
            autoComplete="name"
            minLength={2}
            maxLength={100}
            placeholder="Numele și prenumele tău"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </label>
        <label>
          Telefon <span>(opțional)</span>
          <input
            type="tel"
            name="phone"
            autoComplete="tel"
            maxLength={30}
            placeholder="+40 700 000 000"
            value={form.phone}
            onChange={(event) =>
              setForm({ ...form, phone: event.target.value })
            }
          />
        </label>
      </div>
      <label>
        Adresă de e-mail
        <input
          required
          type="email"
          name="email"
          autoComplete="email"
          maxLength={254}
          placeholder="nume@email.ro"
          value={form.email}
          onChange={(event) => setForm({ ...form, email: event.target.value })}
        />
      </label>
      <label>
        Mesajul tău (opțional)
        <textarea
          name="message"
          minLength={10}
          maxLength={2000}
          rows={3}
          placeholder="Aș vrea să aflu mai multe despre această locuință…"
          value={form.message}
          onChange={(event) =>
            setForm({ ...form, message: event.target.value })
          }
        />
      </label>
      <div className="honeypot" aria-hidden="true">
        <label>
          Lasă acest câmp gol
          <input
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={form.website}
            onChange={(event) =>
              setForm({ ...form, website: event.target.value })
            }
          />
        </label>
      </div>
      <button type="submit" className="heritage-button" disabled={busy || sent}>
        {busy
          ? "Se trimite…"
          : sent
            ? "Mesaj primit"
            : preview
              ? "Încearcă formularul de contact"
              : "Trimite un mesaj"}
        {sent ? <Check size={16} /> : <ArrowUpRight size={16} />}
      </button>
      <small>
        Prin trimitere, ești de acord să fii contactat de {agentName || "agent"}{" "}
        în legătură cu această proprietate.
      </small>
      {preview && (
        <small>Doar previzualizare. Acest formular nu trimite mesaje.</small>
      )}
      {feedback && (
        <p
          className="heritage-form-status"
          data-error={feedback.error || undefined}
          role="status"
        >
          {feedback.text}
        </p>
      )}
    </form>
  );
}
