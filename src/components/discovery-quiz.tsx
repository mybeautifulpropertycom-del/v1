"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { slugify } from "@/lib/model";
import {
  discoveryPath,
  listingKinds,
  parseDiscoveryFilters,
  type CityOption,
  type DiscoveryCategory,
  type ListingKind,
} from "@/lib/property-discovery";

const questions = [
  "Ce vrei să faci?",
  "Ce tip de proprietate cauți?",
  "De câte camere ai nevoie?",
  "Unde cauți?",
  "Care este bugetul tău?",
];

const stepLabels = ["Ofertă", "Proprietate", "Camere", "Localitate", "Buget"];

export function DiscoveryQuiz({ cities }: { cities: CityOption[] }) {
  const router = useRouter();
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  const [step, setStep] = useState(0);
  const [transaction, setTransaction] =
    useState<DiscoveryCategory["transaction"]>("sale");
  const [kind, setKind] = useState<ListingKind>("toate");
  const [rooms, setRooms] = useState("");
  const [city, setCity] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [error, setError] = useState("");
  const last = step === questions.length - 1;
  useEffect(() => {
    if (moved.current) heading.current?.focus({ preventScroll: true });
  }, [step]);

  function goTo(next: number) {
    moved.current = true;
    setStep(next);
    setError("");
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!last) {
      goTo(step + 1);
      return;
    }
    const filters = parseDiscoveryFilters({
      min: min || undefined,
      max: max || undefined,
      moneda: min || max ? currency : undefined,
    });
    if (!filters) {
      setError(
        "Verifică bugetul. Suma minimă trebuie să fie cel mult egală cu suma maximă.",
      );
      return;
    }
    const requestedCity = city.trim();
    const knownCity = cities.find(
      ({ name }) =>
        name.toLocaleLowerCase("ro") === requestedCity.toLocaleLowerCase("ro"),
    );
    const citySlug =
      knownCity?.slug ?? (requestedCity ? slugify(requestedCity) : undefined);
    router.push(
      discoveryPath(
        {
          transaction,
          kind,
          rooms: rooms ? Number(rooms) : undefined,
          city: citySlug,
        },
        filters,
      ),
    );
  }

  return (
    <form
      className="discovery-quiz"
      id="cautare"
      onSubmit={submit}
      aria-labelledby="discovery-question"
    >
      <ol className="discovery-progress" aria-label="Etapele căutării">
        {stepLabels.map((label, index) => (
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
          {questions[step]}
        </h2>
        {step === 0 && (
          <div className="discovery-choices">
            <button
              type="button"
              aria-pressed={transaction === "sale"}
              onClick={() => setTransaction("sale")}
            >
              Vreau să cumpăr
            </button>
            <button
              type="button"
              aria-pressed={transaction === "rent"}
              onClick={() => setTransaction("rent")}
            >
              Vreau să închiriez
            </button>
          </div>
        )}
        {step === 1 && (
          <div className="discovery-choices">
            {Object.entries(listingKinds).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={kind === value}
                onClick={() => {
                  setKind(value as ListingKind);
                  if (value === "terenuri") setRooms("");
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {step === 2 && (
          <label>
            Număr total de camere
            <select
              disabled={kind === "terenuri"}
              value={rooms}
              onChange={(event) => setRooms(event.target.value)}
            >
              <option value="">Toate</option>
              {Array.from({ length: 100 }, (_, index) => index + 1).map(
                (value) => (
                  <option key={value} value={value}>
                    {value} {value === 1 ? "cameră" : "camere"}
                  </option>
                ),
              )}
            </select>
          </label>
        )}
        {step === 3 && (
          <label>
            Oraș sau localitate
            <input
              list="discovery-cities"
              maxLength={80}
              placeholder="Toate localitățile"
              value={city}
              onChange={(event) => setCity(event.target.value)}
            />
            <datalist id="discovery-cities">
              {cities.map((item) => (
                <option key={item.slug} value={item.name} />
              ))}
            </datalist>
            <small>Lasă câmpul gol pentru a căuta în toate localitățile.</small>
          </label>
        )}
        {last && (
          <>
            <div className="discovery-budget">
              <label>
                De la
                <input
                  type="number"
                  min="0"
                  max="999999999999"
                  step="1"
                  placeholder="Fără minim"
                  value={min}
                  onChange={(event) => setMin(event.target.value)}
                />
              </label>
              <label>
                Până la
                <input
                  type="number"
                  min="0"
                  max="999999999999"
                  step="1"
                  placeholder="Fără maxim"
                  value={max}
                  onChange={(event) => setMax(event.target.value)}
                />
              </label>
              <label>
                Monedă
                <select
                  value={currency}
                  onChange={(event) => setCurrency(event.target.value)}
                >
                  <option value="EUR">EUR</option>
                  <option value="RON">RON</option>
                  <option value="USD">USD</option>
                </select>
              </label>
            </div>
            <p className="discovery-hint">
              {transaction === "rent"
                ? "Buget lunar. Lasă sumele goale pentru orice buget."
                : "Lasă sumele goale pentru orice buget."}
            </p>
          </>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="discovery-quiz-actions">
        {step > 0 && (
          <button
            className="discovery-back"
            type="button"
            onClick={() => goTo(step - 1)}
          >
            <ArrowLeft size={16} aria-hidden="true" /> Înapoi
          </button>
        )}
        <button className="discovery-primary">
          {last ? <Search size={17} aria-hidden="true" /> : null}
          {last ? "Vezi proprietățile" : "Continuă"}
          {last ? null : <ArrowRight size={17} aria-hidden="true" />}
        </button>
      </div>
    </form>
  );
}
