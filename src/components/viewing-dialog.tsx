"use client";

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
  const firstWeekday = month.getDay();
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
      setStatus("Choose a preferred date in the calendar.");
      return;
    }
    if (form.phone.replace(/\D/g, "").length < 8) {
      setStatus("Please add a valid phone number so the agent can reach you.");
      return;
    }
    if (preview) {
      setStatus("This is a preview. No viewing request has been sent.");
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
          data.error || "Your request could not be sent. Please try again.",
        );
      setSent(true);
      setStatus(
        `Your request is in ${agentName || "the agent"}’s inbox. They will contact you to confirm the time and availability.`,
      );
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Your request could not be sent. Please contact the agent directly.",
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
      Home: -new Date(month.getFullYear(), month.getMonth(), day).getDay(),
      End: 6 - new Date(month.getFullYear(), month.getMonth(), day).getDay(),
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
        aria-label="Close viewing request"
        onClick={onClose}
      >
        <X size={21} />
      </button>
      <div className="viewing-intro">
        <span className="estate-eyebrow">
          {title || "Your next home"} · A visit, just for you
        </span>
        <h2 id="viewing-title">
          Let’s meet
          <br />
          <em>at your next home.</em>
        </h2>
        <p id="viewing-description">
          Choose a day and leave your details. We’ll be in touch to confirm the
          time and availability.
        </p>
      </div>
      <form onSubmit={submit}>
        <div className="viewing-columns">
          <div className="viewing-fields">
            <label>
              Full name
              <input
                autoFocus
                required
                autoComplete="name"
                name="name"
                minLength={2}
                maxLength={100}
                placeholder="Your first and last name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              Phone number
              <input
                required
                autoComplete="tel"
                name="phone"
                type="tel"
                maxLength={30}
                placeholder="+1 (555) 000-0000"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </label>
            <label>
              Email address
              <input
                required
                autoComplete="email"
                name="email"
                type="email"
                maxLength={254}
                placeholder="you@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
            <label>
              A little more <span>(optional)</span>
              <textarea
                rows={2}
                maxLength={1600}
                placeholder="Anything you’d like us to know?"
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
              />
            </label>
            <p className="viewing-privacy">
              A conversation. A visit. A new beginning.
              <br />
              Your details will be used by {agentName || "the agent"} to contact
              you about this property.
            </p>
          </div>
          <fieldset className="viewing-calendar" disabled={busy || sent}>
            <legend className="sr-only">Preferred viewing date</legend>
            <p>When would you like to visit?</p>
            <div className="viewing-month">
              <button
                type="button"
                disabled={previousDisabled}
                aria-label="Previous month"
                onClick={() =>
                  setMonth(
                    new Date(month.getFullYear(), month.getMonth() - 1, 1),
                  )
                }
              >
                <ChevronLeft size={17} />
              </button>
              <span aria-live="polite">
                {month.toLocaleDateString("en-US", {
                  month: "long",
                  year: "numeric",
                })}
              </span>
              <button
                type="button"
                disabled={nextDisabled}
                aria-label="Next month"
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
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
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
              {selected
                ? viewingDateLabel(selected)
                : "Select your preferred day."}
            </p>
            <small>
              This is a viewing request. Your agent will confirm your
              appointment.
            </small>
          </fieldset>
        </div>
        <div className="honeypot" aria-hidden="true">
          <label>
            Leave this empty
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
              ? "Design preview · No request will be sent."
              : "One step closer to feeling at home."}
          </p>
          <button
            type="submit"
            className="estate-button"
            disabled={busy || sent}
          >
            {busy
              ? "Sending…"
              : sent
                ? "Request received"
                : "Request a private viewing"}
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
