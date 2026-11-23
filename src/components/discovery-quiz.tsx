"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  House,
  KeyRound,
  Search,
} from "lucide-react";
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
const timelineSteps = [
  "Ofertă",
  "Tipul proprietății",
  "Număr de camere",
  "Localitate",
  "Buget",
];
const transactions = [
  ["sale", "Vreau să cumpăr", House],
  ["rent", "Vreau să închiriez", KeyRound],
] as const;
const editorialOfferPhotos = {
  sale: "/images/discovery/quiz-cumparare.webp",
  rent: "/images/discovery/quiz-inchiriere.webp",
} as const;
const propertyTypes = [
  {
    kind: "apartamente",
    label: "Apartament",
    image: "apartament",
  },
  { kind: "case", label: "Casă / Vilă", image: "casa" },
  { kind: "garsoniere", label: "Garsonieră", image: "garsoniera" },
  {
    kind: "penthouse-uri",
    label: "Penthouse",
    image: "penthouse",
  },
] as const satisfies readonly {
  kind: ListingKind;
  label: string;
  image: string;
}[];
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

export function DiscoveryQuiz({ editorial = false }: { editorial?: boolean }) {
  const router = useRouter();
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  const [step, setStep] = useState(0);
  const [transaction, setTransaction] =
    useState<DiscoveryCategory["transaction"]>();
  const [kind, setKind] = useState<(typeof propertyTypes)[number]["kind"]>();
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

  const question = (
    <h2 id="discovery-question" ref={heading} tabIndex={-1}>
      {last && transaction === "rent"
        ? "Care este bugetul tău lunar?"
        : questions[step]}
    </h2>
  );
  const choices = (
    <div className="discovery-question">
      {step === 0 && (
        <div className="discovery-choices discovery-offer-choices">
          {transactions.map(([value, label, Icon]) => (
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
              {editorial && (
                <span className="discovery-editorial-offer-photo">
                  <Image
                    src={editorialOfferPhotos[value]}
                    alt=""
                    fill
                    sizes="(max-width: 720px) 44vw, 20vw"
                    loading="eager"
                  />
                </span>
              )}
              <span className="discovery-offer-icon">
                <Icon size={24} strokeWidth={1.5} aria-hidden="true" />
              </span>
              <span className="discovery-offer-label">{label}</span>
              {editorial ? (
                <span
                  className="discovery-editorial-offer-check"
                  aria-hidden="true"
                >
                  {transaction === value && <Check size={12} />}
                </span>
              ) : (
                <ArrowRight size={16} aria-hidden="true" />
              )}
            </button>
          ))}
        </div>
      )}
      {step === 1 && (
        <div className="discovery-choices discovery-type-choices">
          {propertyTypes.map(({ kind: value, label, image }) => (
            <button
              key={value}
              type="button"
              aria-pressed={kind === value}
              onClick={() => {
                setKind(value);
                goTo(2);
              }}
            >
              <span className="discovery-type-photo">
                <Image
                  src={`/images/discovery/${image}.webp`}
                  alt=""
                  fill
                  sizes="(max-width: 480px) 40vw, (max-width: 800px) 22vw, 150px"
                />
              </span>
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
  );
  const actions = step > 0 && (
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
  );

  return (
    <form
      className={editorial ? "discovery-editorial-quiz" : "discovery-quiz"}
      id="cautare"
      onSubmit={submit}
      aria-labelledby="discovery-question"
    >
      {editorial ? (
        <>
          <nav
            className="discovery-editorial-nav"
            aria-label="Etapele căutării"
          >
            {steps.map((label, index) => (
              <button
                key={label}
                type="button"
                aria-current={index === step ? "step" : undefined}
                disabled={index >= step}
                onClick={() => goTo(index)}
              >
                {label}
              </button>
            ))}
          </nav>
          <ol
            className="discovery-editorial-steps"
            aria-label="Progresul căutării"
          >
            {timelineSteps.map((label, index) => (
              <li
                key={label}
                aria-current={index === step ? "step" : undefined}
              >
                <span className="discovery-editorial-marker" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                {index === step ? (
                  <div className="discovery-editorial-step-content">
                    <div
                      className="discovery-editorial-mobile-progress"
                      role="progressbar"
                      aria-label="Progresul căutării"
                      aria-valuemin={1}
                      aria-valuemax={steps.length}
                      aria-valuenow={step + 1}
                      aria-valuetext={`Pasul ${step + 1} din ${steps.length}: ${label}`}
                    >
                      <span aria-hidden="true">
                        {String(step + 1).padStart(2, "0")} /{" "}
                        {String(steps.length).padStart(2, "0")}
                      </span>
                      <span
                        className="discovery-editorial-progress-track"
                        aria-hidden="true"
                      >
                        {steps.map((name, position) => (
                          <span
                            key={name}
                            data-filled={position <= step || undefined}
                          />
                        ))}
                      </span>
                    </div>
                    {question}
                    {choices}
                    {actions}
                  </div>
                ) : (
                  <span className="discovery-editorial-step-label">
                    {label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </>
      ) : (
        <>
          {question}
          <ol className="discovery-progress" aria-label="Etapele căutării">
            {steps.map((label, index) => (
              <li
                key={label}
                aria-current={index === step ? "step" : undefined}
                data-completed={index < step || undefined}
              >
                <span className="discovery-step-marker" aria-hidden="true">
                  {index < step ? <Check size={13} /> : index + 1}
                </span>
                <span>{label}</span>
              </li>
            ))}
          </ol>
          {choices}
          {actions}
        </>
      )}
    </form>
  );
}
