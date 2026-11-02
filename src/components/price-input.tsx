"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { Property } from "@/lib/model";

export function PriceInput({
  value,
  currency,
  onChange,
}: {
  value: number;
  currency: Property["currency"];
  onChange: (value: number) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);
  const [draft, setDraft] = useState<{
    raw: string;
    value: number;
    currency: string;
  } | null>(null);
  const prefix = new Intl.NumberFormat("en-US", { style: "currency", currency })
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
    return `${prefix}${(whole || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${fraction === undefined ? "" : `.${fraction}`}`;
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
      ref={input}
      type="text"
      inputMode="decimal"
      value={display}
      placeholder={`${prefix}1,250,000`}
      onKeyDown={(event) => {
        const element = event.currentTarget;
        const position = element.selectionStart;
        if (position === null || position !== element.selectionEnd) return;
        // Deleting next to a generated separator should delete a digit, not get stuck.
        if (event.key === "Backspace" && element.value[position - 1] === ",")
          element.setSelectionRange(position - 1, position - 1);
        if (event.key === "Delete" && element.value[position] === ",")
          element.setSelectionRange(position + 1, position + 1);
      }}
      onChange={(event) => {
        const text = event.currentTarget.value;
        const logicalPosition = (
          text
            .slice(0, event.currentTarget.selectionStart ?? text.length)
            .match(/[\d.]/g) || []
        ).length;
        const unprefixed = text.trim().startsWith(prefix)
          ? text.trim().slice(prefix.length)
          : text.trim();
        const cleaned = unprefixed.replace(/[,\s]/g, "");
        if (!/^\d*(?:\.\d{0,2})?$/.test(cleaned)) return;
        const amount = cleaned.replace(/^0+(?=\d)/, "");
        const number = Number(amount || 0);
        if (!Number.isFinite(number) || number > 999999999999) return;
        const formatted = format(amount);
        let position = formatted.length,
          seen = 0;
        for (let i = 0; i < formatted.length; i++) {
          if (/[\d.]/.test(formatted[i]) && ++seen >= logicalPosition) {
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
