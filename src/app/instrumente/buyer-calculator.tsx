"use client";

import { type FormEvent, useEffect, useState } from "react";
import type { BuyerToolSlug } from "./buyer-tools";
import { calculate, fields, readToolNumber } from "./calculations";
import styles from "./calculator.module.css";

type Calculation = ReturnType<(typeof calculate)[BuyerToolSlug]>;
type Currency = "EUR" | "RON";

export function BuyerCalculator({ slug }: { slug: BuyerToolSlug }) {
  const [ready, setReady] = useState(false);
  const [currency, setCurrency] = useState<Currency>("EUR");
  const [result, setResult] = useState<Calculation | null>(null);
  const [invalidField, setInvalidField] = useState<string>();

  useEffect(() => setReady(true), []);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const values: Record<string, number> = {};
    for (const field of fields[slug]) {
      const raw = String(data.get(field.name) ?? "").trim();
      if (!raw && field.optional) continue;
      const value = readToolNumber(raw);
      if (
        value === null ||
        value < field.min ||
        value > field.max ||
        (field.integer && !Number.isInteger(value))
      ) {
        const range = new Intl.NumberFormat("ro-RO");
        setInvalidField(field.name);
        setResult({
          error: `Pentru „${field.label}”, introdu ${field.integer ? "un număr întreg" : "o valoare"} între ${range.format(field.min)} și ${range.format(field.max)}.`,
        });
        const input = form.elements.namedItem(field.name);
        if (input instanceof HTMLInputElement) input.focus();
        return;
      }
      values[field.name] = value;
    }
    setInvalidField(undefined);
    setResult(calculate[slug](values));
  }

  const money = new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });

  return (
    <form
      aria-label="Date pentru calcul"
      aria-describedby="format-sume"
      onSubmit={onSubmit}
      onChange={() => {
        setResult(null);
        setInvalidField(undefined);
      }}
    >
      <label className={styles.currency}>
        Monedă
        <select
          name="currency"
          value={currency}
          onChange={(event) =>
            setCurrency(event.target.value === "RON" ? "RON" : "EUR")
          }
        >
          <option value="EUR">EUR</option>
          <option value="RON">RON</option>
        </select>
      </label>
      <p className={styles.helper} id="format-sume">
        Folosește moneda aleasă pentru toate sumele. Poți scrie 100.000 sau
        100000.
      </p>
      <div className={styles.fields}>
        {fields[slug].map((field) => {
          const invalid = invalidField === field.name;
          return (
            <label className={styles.field} key={field.name}>
              <span>
                {field.label}
                {field.optional && <small> (opțional)</small>}
              </span>
              <input
                name={field.name}
                inputMode={field.integer ? "numeric" : "decimal"}
                autoComplete="off"
                required={!field.optional}
                aria-invalid={invalid || undefined}
                aria-describedby={invalid ? "calculator-error" : undefined}
              />
            </label>
          );
        })}
      </div>
      {result && "error" in result && (
        <p className={styles.error} id="calculator-error" role="alert">
          {result.error}
        </p>
      )}
      <button className={styles.button} type="submit" disabled={!ready}>
        Calculează
      </button>
      <div aria-live="polite">
        {result && "rows" in result && (
          <dl className={styles.results}>
            {result.rows.map(({ label, amount, unit }, index) => (
              <div
                key={label}
                className={index === 0 ? styles.primaryResult : undefined}
              >
                <dt>{label}</dt>
                <dd>
                  {money.format(amount)}
                  {unit && <small> {unit}</small>}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </form>
  );
}
