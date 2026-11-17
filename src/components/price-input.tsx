"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { Property } from "@/lib/model";

export function PriceInput({
  value,
  currency,
  onChange,
  guideField,
  guideIssue,
}: {
  value: number;
  currency: Property["currency"];
  onChange: (value: number) => void;
  guideField?: string;
  guideIssue?: string | null;
}) {
  const input = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);
  const [draft, setDraft] = useState<{
    raw: string;
    value: number;
    currency: string;
  } | null>(null);
  const symbol = new Intl.NumberFormat("ro-RO", { style: "currency", currency })
    .formatToParts(0)
    .find((part) => part.type === "currency")!.value;
  const raw =
    draft?.value === value && draft.currency === currency
      ? draft.raw
      : value
        ? String(value)
        : "";
  function format(amount: string) {
    if (!amount) return "";
    const [whole, fraction] = amount.split(".");
    return `${(whole || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}${fraction === undefined ? "" : `,${fraction}`} ${symbol}`;
  }
  const display = format(raw);
  useLayoutEffect(() => {
    if (caret.current !== null) {
      input.current?.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  });
  return (
    <input
      data-property-guide-field={guideField}
      data-guide-issue={guideIssue || undefined}
      ref={input}
      type="text"
      inputMode="decimal"
      value={display}
      placeholder={`1.250.000 ${symbol}`}
      onKeyDown={(event) => {
        const element = event.currentTarget;
        const position = element.selectionStart;
        if (position === null || position !== element.selectionEnd) return;
        // Deleting next to a generated separator should delete a digit, not get stuck.
        if (event.key === "Backspace" && element.value[position - 1] === ".")
          element.setSelectionRange(position - 1, position - 1);
        if (event.key === "Delete" && element.value[position] === ".")
          element.setSelectionRange(position + 1, position + 1);
      }}
      onChange={(event) => {
        const text = event.currentTarget.value;
        const logicalPosition = (
          text
            .slice(0, event.currentTarget.selectionStart ?? text.length)
            .match(/[\d,]/g) || []
        ).length;
        const cleaned = text
          .trim()
          .replace(symbol, "")
          .replace(currency, "")
          .replace(/[.\s]/g, "")
          .replace(",", ".");
        if (!/^\d*(?:\.\d{0,2})?$/.test(cleaned)) return;
        const amount = cleaned.replace(/^0+(?=\d)/, "");
        const number = Number(amount || 0);
        if (!Number.isFinite(number) || number > 999999999999) return;
        const formatted = format(amount);
        let position = formatted.length,
          seen = 0;
        for (let i = 0; i < formatted.length; i++) {
          if (/[\d,]/.test(formatted[i]) && ++seen >= logicalPosition) {
            position = i + 1;
            break;
          }
        }
        caret.current = position;
        setDraft({ raw: amount, value: number, currency });
        onChange(number);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}
