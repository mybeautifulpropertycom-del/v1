"use client";

import { type FormEvent, useEffect, useState } from "react";
import styles from "./guide-tools.module.css";

const amounts = [
  { name: "price", label: "Prețul apartamentului", required: true },
  { name: "funds", label: "Bani disponibili acum", required: true },
  {
    name: "deposit",
    label: "Avans din surse proprii",
    creditOnly: true,
    required: true,
  },
  { name: "notary", label: "Notar și înscriere" },
  { name: "bank", label: "Bancă și evaluare", creditOnly: true },
  { name: "agency", label: "Comision și alte cheltuieli la semnare" },
  { name: "moving", label: "Mutare și lucrări inițiale" },
] as const satisfies readonly {
  name: string;
  label: string;
  required?: boolean;
  creditOnly?: boolean;
}[];

// Work in bani/cents so sums and comparisons remain exact.
function readAmount(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || !value.trim()) return 0;
  const text = value.trim().replace(/[\u00a0\u202f]/g, " ");
  const englishDecimal = /^\d+\.\d{1,2}$/.test(text);
  const romanian = /^(?:\d+|\d{1,3}(?:[. ]\d{3})+)(?:,\d{1,2})?$/.test(text);
  if (!englishDecimal && !romanian) return null;
  const [whole, fraction = ""] = (
    englishDecimal ? text : text.replace(/[. ]/g, "").replace(",", ".")
  ).split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents <= 99_999_999_999_999
    ? cents
    : null;
}

type Budget = {
  currency: string;
  loan: number;
  atSigning: number;
  total: number;
  remaining: number;
};

export function PurchaseBudget() {
  const [ready, setReady] = useState(false);
  const [payment, setPayment] = useState<"credit" | "cash">("credit");
  const [budget, setBudget] = useState<Budget | null>(null);
  const [invalid, setInvalid] = useState<{
    field: string;
    message: string;
  } | null>(null);
  const credit = payment === "credit";

  useEffect(() => setReady(true), []);

  function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const parsed: Record<string, number> = {};
    function reject(field: string, message: string) {
      setBudget(null);
      setInvalid({ field, message });
      const input = form.elements.namedItem(field);
      if (input instanceof HTMLInputElement) input.focus();
    }

    for (const item of amounts) {
      const value = fields.get(item.name);
      if (!credit && "creditOnly" in item) {
        parsed[item.name] = 0;
        continue;
      }
      if ("required" in item && typeof value === "string" && !value.trim())
        return reject(item.name, `Completează câmpul „${item.label}”.`);
      const amount = readAmount(value);
      if (amount === null)
        return reject(item.name, `Verifică suma pentru „${item.label}”.`);
      parsed[item.name] = amount;
    }
    if (parsed.price <= 0)
      return reject("price", "Introdu un preț mai mare decât zero.");
    if (credit && parsed.deposit > parsed.price)
      return reject(
        "deposit",
        "Avansul trebuie să fie cel mult egal cu prețul apartamentului.",
      );

    const fees = parsed.notary + parsed.bank + parsed.agency;
    const ownContribution = credit ? parsed.deposit : parsed.price;
    const atSigning = ownContribution + fees;
    setInvalid(null);
    setBudget({
      currency: fields.get("currency") === "RON" ? "RON" : "EUR",
      loan: parsed.price - ownContribution,
      atSigning,
      total: parsed.price + fees + parsed.moving,
      remaining: parsed.funds - atSigning - parsed.moving,
    });
  }

  function format(value: number) {
    return new Intl.NumberFormat("ro-RO", {
      style: "currency",
      currency: budget?.currency ?? "EUR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value / 100);
  }

  return (
    <form
      onSubmit={calculate}
      onChange={() => {
        setBudget(null);
        setInvalid(null);
      }}
      aria-label="Calculator costuri cumpărare"
    >
      <p>
        Folosește aceeași monedă pentru toate sumele. Pentru câmpurile de cost
        necompletate, calculul folosește zero.
      </p>
      <div className={styles.fields}>
        <label className={styles.field}>
          Tipul plății
          <select
            name="payment"
            value={payment}
            onChange={(event) =>
              setPayment(event.target.value === "cash" ? "cash" : "credit")
            }
          >
            <option value="credit">Cu credit</option>
            <option value="cash">Integral din economii</option>
          </select>
        </label>
        <label className={styles.field}>
          Monedă
          <select name="currency">
            <option value="EUR">EUR</option>
            <option value="RON">RON</option>
          </select>
        </label>
        {amounts.map((item) =>
          !credit && "creditOnly" in item ? null : (
            <label className={styles.field} key={item.name}>
              {item.label}
              <input
                name={item.name}
                inputMode="decimal"
                autoComplete="off"
                required={"required" in item}
                placeholder={item.name === "price" ? "Ex. 100.000" : undefined}
                aria-invalid={invalid?.field === item.name || undefined}
                aria-describedby={
                  invalid?.field === item.name ? "budget-error" : undefined
                }
              />
            </label>
          ),
        )}
      </div>
      {invalid && (
        <p className={styles.error} id="budget-error" role="alert">
          {invalid.message}
        </p>
      )}
      <button className={styles.button} type="submit" disabled={!ready}>
        Calculează bugetul
      </button>
      <div aria-live="polite">
        {budget && (
          <dl className={styles.results}>
            <div>
              <dt>Bani necesari până la semnare</dt>
              <dd>{format(budget.atSigning)}</dd>
            </div>
            <div>
              <dt>Sumă estimată de finanțat</dt>
              <dd>{format(budget.loan)}</dd>
            </div>
            <div>
              <dt>Total estimat până la mutare</dt>
              <dd>{format(budget.total)}</dd>
            </div>
            <div>
              <dt>
                {budget.remaining < 0
                  ? "Sumă care lipsește până la mutare"
                  : "Bani rămași din economii după mutare"}
              </dt>
              <dd className={budget.remaining < 0 ? styles.deficit : undefined}>
                {format(Math.abs(budget.remaining))}
              </dd>
            </div>
          </dl>
        )}
      </div>
    </form>
  );
}
