"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Search } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  discoveryCities,
  discoveryPath,
  type DiscoveryCategory,
  type DiscoveryRooms,
  type ListingKind,
} from "@/lib/property-discovery";

const questions = [
  "Ce vrei să faci?",
  "Ce tip de proprietate cauți?",
  "De câte camere ai nevoie?",
  "În ce oraș cauți?",
  "Care este bugetul tău?",
];

const steps = ["Ofertă", "Proprietate", "Camere", "Localitate", "Buget"];
const transactions = [
  ["sale", "Vreau să cumpăr"],
  ["rent", "Vreau să închiriez"],
] as const;
const propertyTypes = [
  ["apartamente", "Apartament"],
  ["case", "Casă / Vilă"],
  ["garsoniere", "Garsonieră"],
  ["penthouse-uri", "Penthouse"],
] as const satisfies readonly (readonly [ListingKind, string])[];
const roomOptions = [1, 2, 3, 4, 5, 6, 7, "8+"] as const;

type Budget = readonly [min: number, max?: number];
const budgets = {
  sale: [
    [0, 50_000],
    [50_000, 100_000],
    [100_000, 200_000],
    [200_000, 300_000],
    [300_000, 500_000],
    [500_000, 800_000],
    [800_000, 1_000_000],
    [1_000_000, 1_500_000],
    [1_500_000, 2_000_000],
    [2_000_000],
  ],
  rent: [
    [0, 300],
    [300, 500],
    [500, 800],
    [800, 1_000],
    [1_000, 1_500],
    [1_500, 2_000],
    [2_000, 3_000],
    [3_000],
  ],
} as const satisfies Record<
  DiscoveryCategory["transaction"],
  readonly Budget[]
>;

const amount = new Intl.NumberFormat("ro-RO", { useGrouping: "always" });

function budgetLabel([min, max]: Budget) {
  return max === undefined
    ? `€${amount.format(min)}+`
    : `€${amount.format(min)} – €${amount.format(max)}`;
}

export function DiscoveryQuiz() {
  const router = useRouter();
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  const [step, setStep] = useState(0);
  const [transaction, setTransaction] =
    useState<DiscoveryCategory["transaction"]>();
  const [kind, setKind] = useState<(typeof propertyTypes)[number][0]>();
  const [rooms, setRooms] = useState<DiscoveryRooms>();
  const [city, setCity] = useState<string>();
  const [budget, setBudget] = useState<Budget>();
  const [isPending, startTransition] = useTransition();
  const last = step === steps.length - 1;

  useEffect(() => {
    if (moved.current) heading.current?.focus();
  }, [step]);

  function goTo(next: number) {
    moved.current = true;
    setStep(next);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !last ||
      !transaction ||
      !kind ||
      !rooms ||
      !city ||
      !budget ||
      isPending
    )
      return;

    const [min, max] = budget;
    const target = discoveryPath(
      { transaction, kind, rooms, city },
      { min, max, currency: "EUR", page: 1 },
    );
    startTransition(() => router.push(target));
  }

  return (
    <form
      className="discovery-quiz"
      id="cautare"
      onSubmit={submit}
      aria-labelledby="discovery-question"
    >
      <ol className="discovery-progress" aria-label="Etapele căutării">
        {steps.map((label, index) => (
          <li
            key={label}
            aria-current={index === step ? "step" : undefined}
            data-completed={index < step || undefined}
          >
            <span>{label}</span>
          </li>
        ))}
      </ol>
      <div className="discovery-question">
        <h2 id="discovery-question" ref={heading} tabIndex={-1}>
          {last && transaction === "rent"
            ? "Care este bugetul tău lunar?"
            : questions[step]}
        </h2>
        {step === 0 && (
          <div className="discovery-choices">
            {transactions.map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={transaction === value}
                onClick={() => {
                  if (transaction !== value) setBudget(undefined);
                  setTransaction(value);
                  goTo(1);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {step === 1 && (
          <div className="discovery-choices">
            {propertyTypes.map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={kind === value}
                onClick={() => {
                  setKind(value);
                  goTo(2);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {step === 2 && (
          <div className="discovery-choices discovery-room-choices">
            {roomOptions.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={rooms === value}
                onClick={() => {
                  setRooms(value);
                  goTo(3);
                }}
              >
                {value}
              </button>
            ))}
          </div>
        )}
        {step === 3 && (
          <div className="discovery-choices discovery-city-choices">
            {[...discoveryCities].map(([slug, name]) => (
              <button
                key={slug}
                type="button"
                aria-pressed={city === slug}
                onClick={() => {
                  setCity(slug);
                  goTo(4);
                }}
              >
                {name}
              </button>
            ))}
          </div>
        )}
        {last && transaction && (
          <div className="discovery-choices">
            {budgets[transaction].map((option) => (
              <button
                key={option[0]}
                type="button"
                aria-pressed={budget === option}
                onClick={() => setBudget(option)}
              >
                {budgetLabel(option)}
              </button>
            ))}
          </div>
        )}
      </div>
      {step > 0 && (
        <div className="discovery-quiz-actions">
          <button
            className="discovery-back"
            type="button"
            onClick={() => goTo(step - 1)}
          >
            <ArrowLeft size={16} aria-hidden="true" /> Înapoi
          </button>
          {last && (
            <button
              className="discovery-primary"
              type="submit"
              disabled={!budget || isPending}
            >
              <Search size={17} aria-hidden="true" /> Vezi proprietățile
            </button>
          )}
        </div>
      )}
    </form>
  );
}
