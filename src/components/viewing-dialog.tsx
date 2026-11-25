"use client";
import { presentationCopy } from "@/lib/presentation-copy";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { localDateKey, viewingDateLabel } from "@/lib/viewing-date";
import { trapDialogFocus } from "./website-dialog-focus";

export function ViewingDialog({
  title,
  slug,
  agentName,
  preview,
  onClose,
}: {
  title: string;
  slug: string;
  agentName: string;
  preview: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [today] = useState(() => new Date());
  const [month, setMonth] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [selected, setSelected] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    message: "",
    website: "",
  });
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const maxDate = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() + 365,
  );
  const todayKey = localDateKey(today);
  const maxKey = localDateKey(maxDate);
  const firstWeekday = (month.getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const previousDisabled =
    month.getFullYear() === today.getFullYear() &&
    month.getMonth() === today.getMonth();
  const nextDisabled =
    month.getFullYear() === maxDate.getFullYear() &&
    month.getMonth() === maxDate.getMonth();

  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    element?.showModal();
    element
      ?.querySelector<HTMLInputElement>('input[name="name"]')
      ?.focus({ preventScroll: true });
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = overflow;
      previous?.focus({ preventScroll: true });
    };
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || sent) return;
    if (!selected || selected < localDateKey(new Date()) || selected > maxKey) {
      setStatus("Alege data preferată în calendar.");
      return;
    }
    if (form.phone.replace(/\D/g, "").length < 8) {
      setStatus(
        "Adaugă un număr de telefon valid pentru a putea fi contactat de agent.",
      );
      return;
    }
    if (preview) {
      setStatus(
        "Aceasta este o previzualizare. Nu a fost trimisă nicio cerere de vizionare.",
      );
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, slug, preferredDate: selected }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error || "Cererea nu a putut fi trimisă. Încearcă din nou.",
        );
      setSent(true);
      setStatus(
        `Cererea a ajuns la ${agentName || "agent"}. Vei fi contactat pentru confirmarea orei și disponibilității.`,
      );
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Cererea nu a putut fi trimisă. Contactează direct agentul.",
      );
    } finally {
      setBusy(false);
    }
  }

  function moveCalendarFocus(
    event: React.KeyboardEvent<HTMLButtonElement>,
    day: number,
  ) {
    const offsets: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
      Home: -(
        (new Date(month.getFullYear(), month.getMonth(), day).getDay() + 6) %
        7
      ),
      End:
        6 -
        ((new Date(month.getFullYear(), month.getMonth(), day).getDay() + 6) %
          7),
    };
    if (!(event.key in offsets)) return;
    event.preventDefault();
    const next = new Date(
      month.getFullYear(),
      month.getMonth(),
      day + offsets[event.key],
    );
    const key = localDateKey(next);
    if (key < todayKey || key > maxKey) return;
    if (
      next.getMonth() !== month.getMonth() ||
      next.getFullYear() !== month.getFullYear()
    )
      setMonth(new Date(next.getFullYear(), next.getMonth(), 1));
    requestAnimationFrame(() =>
      dialog.current
        ?.querySelector<HTMLButtonElement>(`[data-date="${key}"]`)
        ?.focus(),
    );
  }

  return (
    <dialog
      ref={dialog}
      className="viewing-dialog"
      aria-labelledby="viewing-title"
      aria-describedby="viewing-description"
      onKeyDown={trapDialogFocus}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            onClose();
        }
      }}
    >
      <button
        type="button"
        className="viewing-close"
        aria-label="Închide cererea de vizionare"
        onClick={onClose}
      >
        <X size={21} />
      </button>
      <div className="viewing-intro">
        <span className="estate-eyebrow">
          <span className="viewing-property-title">
            {title || "Următoarea ta locuință"}&nbsp;·
          </span>
          O vizionare doar pentru tine
        </span>
        <h2 id="viewing-title">
          Să ne întâlnim
          <br />
          <em>la viitoarea ta locuință.</em>
        </h2>
        <p id="viewing-description">{presentationCopy.viewingSubtitle}</p>
      </div>
      <form onSubmit={submit}>
        <div className="viewing-columns">
          <div className="viewing-fields">
            <label>
              Nume complet
              <input
                autoFocus
                required
                autoComplete="name"
                name="name"
                minLength={2}
                maxLength={100}
                placeholder="Numele și prenumele tău"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              Număr de telefon
              <input
                required
                autoComplete="tel"
                name="phone"
                type="tel"
                maxLength={30}
                placeholder="+40 700 000 000"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </label>
            <label>
              Adresă de e-mail
              <input
                required
                autoComplete="email"
                name="email"
                type="email"
                maxLength={254}
                placeholder="nume@email.ro"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
            <label>
              Câteva detalii <span>(opțional)</span>
              <textarea
                rows={2}
                maxLength={1600}
                placeholder="Ce ai dori să ne mai spui?"
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
              />
            </label>
            <p className="viewing-privacy">
              O conversație. O vizionare. Un nou început.
              <br />
              Datele tale vor fi folosite de {agentName || "agent"} pentru a te
              contacta în legătură cu această proprietate.
            </p>
          </div>
          <fieldset className="viewing-calendar" disabled={busy || sent}>
            <legend className="sr-only">Data preferată pentru vizionare</legend>
            <p>Când ai dori să vizitezi proprietatea?</p>
            <div className="viewing-month">
              <button
                type="button"
                disabled={previousDisabled}
                aria-label="Luna anterioară"
                onClick={() =>
                  setMonth(
                    new Date(month.getFullYear(), month.getMonth() - 1, 1),
                  )
                }
              >
                <ChevronLeft size={17} />
              </button>
              <span aria-live="polite">
                {month.toLocaleDateString("ro-RO", {
                  month: "long",
                  year: "numeric",
                })}
              </span>
              <button
                type="button"
                disabled={nextDisabled}
                aria-label="Luna următoare"
                onClick={() =>
                  setMonth(
                    new Date(month.getFullYear(), month.getMonth() + 1, 1),
                  )
                }
              >
                <ChevronRight size={17} />
              </button>
            </div>
            <div className="viewing-weekdays" aria-hidden="true">
              {["Lu", "Ma", "Mi", "Jo", "Vi", "Sâ", "Du"].map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className="viewing-days">
              {Array.from({ length: firstWeekday }, (_, i) => (
                <span key={`empty-${i}`} />
              ))}
              {Array.from({ length: days }, (_, i) => {
                const key = localDateKey(
                  new Date(month.getFullYear(), month.getMonth(), i + 1),
                );
                return (
                  <button
                    key={key}
                    type="button"
                    data-date={key}
                    disabled={key < todayKey || key > maxKey}
                    aria-label={viewingDateLabel(key)}
                    aria-pressed={selected === key}
                    aria-current={key === todayKey ? "date" : undefined}
                    onKeyDown={(e) => moveCalendarFocus(e, i + 1)}
                    onClick={() => {
                      setSelected(key);
                      setStatus("");
                    }}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
            <p className="viewing-selected" aria-live="polite">
              {selected ? viewingDateLabel(selected) : "Alege ziua preferată."}
            </p>
            <small>
              Aceasta este o cerere de vizionare. Agentul va confirma
              programarea.
            </small>
          </fieldset>
        </div>
        <div className="honeypot" aria-hidden="true">
          <label>
            Lasă acest câmp gol
            <input
              tabIndex={-1}
              autoComplete="off"
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
            />
          </label>
        </div>
        <div className="viewing-submit">
          <p>
            {preview
              ? "Previzualizare design · Nu se trimite nicio cerere."
              : "Cu un pas mai aproape de acasă."}
          </p>
          <button
            type="submit"
            className="estate-button"
            disabled={busy || sent}
          >
            {busy
              ? "Se trimite…"
              : sent
                ? "Cerere primită"
                : "Solicită o vizionare privată"}
            {sent ? <Check size={17} /> : <ArrowUpRight size={17} />}
          </button>
        </div>
        {status && (
          <p
            className={`estate-form-status ${sent ? "success" : ""}`}
            role="status"
          >
            {status}
          </p>
        )}
      </form>
    </dialog>
  );
}
