"use client";
import { presentationCopy } from "@/lib/presentation-copy";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { PublicProperty } from "@/lib/model";
import { calculateMortgage, mortgageSchedule } from "@/lib/mortgage";
import { PropertyImage } from "./property-image";

type MortgageProperty = Pick<
  PublicProperty,
  "price" | "currency" | "transaction" | "images"
>;
export function PropertyMortgage({ property }: { property: MortgageProperty }) {
  if (
    property.transaction !== "sale" ||
    !Number.isFinite(property.price) ||
    property.price <= 0
  )
    return null;
  return <MortgageCalculator key={property.currency} property={property} />;
}

function MortgageCalculator({ property }: { property: MortgageProperty }) {
  const id = useId();
  const table = useRef<HTMLDivElement>(null);
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const photo = property.images?.[0] || "";
  const [depositText, setDeposit] = useState("20");
  const [years, setYears] = useState(30);
  const [rate, setRate] = useState("4.7");
  const [lei, setLei] = useState(false);
  const [exchange, setExchange] = useState(
    property.currency === "USD" ? "4.6" : "5",
  );
  const [page, setPage] = useState(0);
  const deposit = depositText.trim() === "" ? NaN : Number(depositText);
  const annualRate = rate.trim() === "" ? NaN : Number(rate);
  const converting = lei && property.currency !== "RON";
  const currency = converting ? "RON" : property.currency;
  const exchangeValid =
    !converting ||
    (exchange.trim() !== "" && Number(exchange) > 0 && Number(exchange) <= 100);
  const price = property.price * (converting ? Number(exchange) : 1);
  const result = useMemo(
    () =>
      exchangeValid
        ? calculateMortgage(price, deposit, years, annualRate)
        : null,
    [price, deposit, years, annualRate, exchangeValid],
  );
  const schedule = useMemo(
    () => (result ? mortgageSchedule(result, annualRate) : []),
    [result, annualRate],
  );
  useEffect(() => setPage(0), [price, deposit, years, annualRate]);
  const money = (amount: number, unit = currency, decimals = 0) =>
    new Intl.NumberFormat("ro-RO", {
      style: "currency",
      currency: unit,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount);
  const number = (amount: number) =>
    new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 0 }).format(amount);
  const track = (value: number) =>
    ({
      "--range-progress": `${Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0}%`,
    }) as CSSProperties;
  const share =
    result && result.total > 0 ? result.principal / result.total : 0;
  const points = result
    ? [
        { year: 0, balance: result.principal },
        ...schedule
          .filter((row) => row.month % 12 === 0)
          .map((row) => ({ year: row.month / 12, balance: row.balance })),
      ]
    : [];
  const chartPoints = points
    .map(
      (point) =>
        `${46 + (point.year / years) * 506},${130 - (result && result.principal > 0 ? point.balance / result.principal : 0) * 110}`,
    )
    .join(" ");
  const visiblePage = Math.min(
    page,
    Math.max(0, Math.ceil(schedule.length / 6) - 1),
  );
  const rows = schedule.slice(visiblePage * 6, visiblePage * 6 + 6);
  const valid = Boolean(result);
  return (
    <section className="property-mortgage" aria-labelledby={`${id}-heading`}>
      <div className="mortgage-intro">
        {photo && failedPhoto !== photo && (
          <PropertyImage
            className="mortgage-property-photo"
            src={photo}
            alt=""
            aria-hidden="true"
            sizes="(max-width: 760px) 100vw, 40vw"
            onError={() => setFailedPhoto(photo)}
          />
        )}
        <div className="mortgage-intro-copy">
          <span className="mortgage-eyebrow">
            CALCULATOR DE CREDIT IPOTECAR
          </span>
          <h2 id={`${id}-heading`}>{presentationCopy.mortgage.title}</h2>
          <p>{presentationCopy.mortgage.subtitle}</p>
        </div>
      </div>
      <div className="mortgage-layout">
        <div className="mortgage-controls">
          <div className="mortgage-price">
            <span>Prețul locuinței</span>
            <strong>{money(property.price, property.currency)}</strong>
            <small>Preluat din anunț</small>
          </div>
          {property.currency !== "RON" && (
            <div className="mortgage-currency-row">
              <span>Moneda simulării</span>
              <div
                className="mortgage-segment"
                role="group"
                aria-label="Moneda simulării"
              >
                <button
                  type="button"
                  aria-pressed={!lei}
                  onClick={() => setLei(false)}
                >
                  {property.currency}
                </button>
                <button
                  type="button"
                  aria-pressed={lei}
                  onClick={() => setLei(true)}
                >
                  RON
                </button>
              </div>
            </div>
          )}
          {converting && (
            <div className="mortgage-exchange">
              <label htmlFor={`${id}-exchange`}>
                Curs de calcul · 1 {property.currency} în RON
              </label>
              <input
                id={`${id}-exchange`}
                type="number"
                min="0.01"
                max="100"
                step="0.01"
                value={exchange}
                onChange={(e) => setExchange(e.target.value)}
              />
              <small>
                Curs orientativ, introdus manual; nu este un curs BNR sau bancar
                în timp real.
              </small>
            </div>
          )}
          <div className="mortgage-control">
            <div className="mortgage-control-title">
              <label htmlFor={`${id}-deposit-value`}>Avansul tău</label>
              <div className="mortgage-number">
                <input
                  id={`${id}-deposit-value`}
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={depositText}
                  onChange={(e) => setDeposit(e.target.value)}
                />
                <span>%</span>
              </div>
            </div>
            <input
              aria-label="Avansul tău"
              type="range"
              min="0"
              max="100"
              step="1"
              value={Number.isFinite(deposit) ? deposit : 0}
              style={track(deposit)}
              onChange={(e) => setDeposit(e.target.value)}
            />
            <div className="mortgage-control-note">
              <span>Din surse proprii</span>
              <strong>{result ? money(result.deposit) : "—"}</strong>
            </div>
          </div>
          <div className="mortgage-control">
            <div className="mortgage-control-title">
              <label htmlFor={`${id}-years`}>Perioada creditului</label>
              <select
                id={`${id}-years`}
                value={years}
                onChange={(e) => setYears(Number(e.target.value))}
              >
                {Array.from({ length: 31 }, (_, i) => i + 5).map((year) => (
                  <option key={year} value={year}>
                    {year} ani
                  </option>
                ))}
              </select>
            </div>
            <input
              aria-label="Perioada creditului"
              type="range"
              min="5"
              max="35"
              step="1"
              value={years}
              style={track(((years - 5) / 30) * 100)}
              onChange={(e) => setYears(Number(e.target.value))}
            />
            <div className="mortgage-control-note">
              <span>5 ani</span>
              <span>35 de ani</span>
            </div>
          </div>
          <div className="mortgage-control">
            <div className="mortgage-control-title">
              <label htmlFor={`${id}-rate`}>Dobândă anuală</label>
              <div className="mortgage-number">
                <input
                  id={`${id}-rate`}
                  type="number"
                  min="0"
                  max="30"
                  step="0.01"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                />
                <span>%</span>
              </div>
            </div>
            <input
              aria-label="Reglează dobânda anuală"
              type="range"
              min="0"
              max="15"
              step="0.1"
              value={Number.isFinite(annualRate) ? Math.min(15, annualRate) : 0}
              style={track((annualRate / 15) * 100)}
              onChange={(e) => setRate(e.target.value)}
            />
            <div className="mortgage-control-note">
              <span>Nominală, presupusă constantă</span>
            </div>
          </div>
          {!valid && (
            <p className="mortgage-validation" role="alert">
              Introdu un avans între 0 și 100%, o dobândă între 0 și 30% și un
              curs valid.
            </p>
          )}
          <button
            type="button"
            className="mortgage-plan-button"
            disabled={!valid}
            onClick={() =>
              table.current?.scrollIntoView({
                behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
                  .matches
                  ? "instant"
                  : "smooth",
                block: "nearest",
              })
            }
          >
            Vezi planul de rambursare
          </button>
          <p className="mortgage-auto-note">
            Estimarea se actualizează automat.
          </p>
        </div>
        <div className="mortgage-output">
          <div className="mortgage-result">
            <div className="mortgage-result-top">
              <div>
                <span className="mortgage-eyebrow">RATĂ LUNARĂ ESTIMATĂ</span>
                <div
                  className="mortgage-monthly"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  <strong>{result ? number(result.monthly) : "—"}</strong>
                  <span>
                    {currency}
                    <small>/ lună</small>
                  </span>
                </div>
              </div>
              <div className="mortgage-borrowed">
                <span>Suma împrumutată</span>
                <strong>{result ? money(result.principal) : "—"}</strong>
              </div>
            </div>
            <div className="mortgage-structure">
              <div
                className="mortgage-donut"
                role="img"
                aria-label={
                  result
                    ? `Structura creditului: suma împrumutată ${money(result.principal)}, dobândă totală ${money(result.interest)}`
                    : "Structura creditului indisponibilă"
                }
              >
                <svg viewBox="0 0 100 100" aria-hidden="true">
                  <circle
                    cx="50"
                    cy="50"
                    r="41"
                    fill="none"
                    stroke={
                      result && result.total > 0
                        ? "var(--mortgage-interest)"
                        : "#ffffff30"
                    }
                    strokeWidth="12"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="41"
                    fill="none"
                    stroke="var(--mortgage-principal)"
                    strokeWidth="12"
                    strokeDasharray={`${share * 257.61} 257.61`}
                    transform="rotate(-90 50 50)"
                  />
                </svg>
                <div>
                  <strong>{result ? number(result.total) : "—"}</strong>
                  <span>{currency} · cost total</span>
                </div>
              </div>
              <div className="mortgage-breakdown">
                <h3>Structura creditului</h3>
                <dl>
                  <div>
                    <dt>
                      <i className="principal-swatch" />
                      Suma împrumutată
                    </dt>
                    <dd>{result ? money(result.principal) : "—"}</dd>
                  </div>
                  <div>
                    <dt>
                      <i className="interest-swatch" />
                      Dobândă totală
                    </dt>
                    <dd>{result ? money(result.interest) : "—"}</dd>
                  </div>
                  <div className="mortgage-total">
                    <dt>Total de rambursat</dt>
                    <dd>{result ? money(result.total) : "—"}</dd>
                  </div>
                </dl>
                <small>
                  Pe întreaga perioadă, fără avans și costuri suplimentare.
                </small>
              </div>
            </div>
            <div className="mortgage-balance">
              <h3>Evoluția soldului creditului</h3>
              <svg
                viewBox="0 0 570 158"
                role="img"
                aria-label={
                  result
                    ? `Soldul scade de la ${money(result.principal)} la zero în ${years} ani`
                    : "Evoluția soldului indisponibilă"
                }
              >
                <defs>
                  <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor="var(--mortgage-principal)"
                      stopOpacity=".4"
                    />
                    <stop
                      offset="100%"
                      stopColor="var(--mortgage-principal)"
                      stopOpacity=".03"
                    />
                  </linearGradient>
                </defs>
                {[0, 0.5, 1].map((ratio) => (
                  <g key={ratio}>
                    <line
                      x1="46"
                      x2="552"
                      y1={130 - ratio * 110}
                      y2={130 - ratio * 110}
                      stroke="#ffffff25"
                    />
                    <text x="38" y={134 - ratio * 110} textAnchor="end">
                      {result ? number((result.principal * ratio) / 1000) : "—"}
                      k
                    </text>
                  </g>
                ))}
                {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
                  <g key={ratio}>
                    <line
                      x1={46 + ratio * 506}
                      x2={46 + ratio * 506}
                      y1="20"
                      y2="130"
                      stroke="#ffffff12"
                    />
                    <text x={46 + ratio * 506} y="150" textAnchor="middle">
                      {Math.round(years * ratio)} ani
                    </text>
                  </g>
                ))}
                {valid && (
                  <>
                    <polygon
                      points={`46,130 ${chartPoints} 552,130`}
                      fill={`url(#${id}-fill)`}
                    />
                    <polyline
                      points={chartPoints}
                      fill="none"
                      stroke="var(--mortgage-principal)"
                      strokeWidth="2"
                    />
                  </>
                )}
              </svg>
              <span className="mortgage-chart-unit">
                Sold în mii de {currency}
              </span>
            </div>
          </div>
          <div className="mortgage-schedule" ref={table} tabIndex={-1}>
            <div className="mortgage-schedule-heading">
              <h3>Planul de rambursare</h3>
              <span>Calcul orientativ</span>
            </div>
            <div
              className="mortgage-table-scroll"
              role="region"
              aria-label="Tabelul ratelor lunare"
              tabIndex={0}
            >
              <table>
                <caption>
                  Rate egale, dobândă nominală constantă; valori rotunjite la
                  două zecimale.
                </caption>
                <thead>
                  <tr>
                    {["Luna", "Rată", "Principal", "Dobândă", "Sold"].map(
                      (text) => (
                        <th key={text} scope="col">
                          {text}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.month}>
                      <th scope="row">{row.month}</th>
                      <td>{money(row.payment, currency, 2)}</td>
                      <td>{money(row.principal, currency, 2)}</td>
                      <td>{money(row.interest, currency, 2)}</td>
                      <td>{money(row.balance, currency, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!valid && (
                <p className="mortgage-empty">
                  Completează valorile pentru a vedea planul.
                </p>
              )}
            </div>
            <div className="mortgage-pagination">
              <button
                type="button"
                disabled={visiblePage === 0 || !valid}
                onClick={() => setPage(visiblePage - 1)}
              >
                Înapoi
              </button>
              <span>
                {valid
                  ? `Lunile ${visiblePage * 6 + 1}–${Math.min(visiblePage * 6 + 6, schedule.length)} din ${schedule.length}`
                  : "—"}
              </span>
              <button
                type="button"
                disabled={!valid || (visiblePage + 1) * 6 >= schedule.length}
                onClick={() => setPage(visiblePage + 1)}
              >
                Următoarele 6
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="mortgage-notes">
        <p>
          Simulare orientativă. Comisioanele, asigurările și taxele nu sunt
          incluse.
        </p>
        <details>
          <summary>Ipotezele calculului</summary>
          <p>
            Dobânda inițială de 4,7% este un exemplu, nu o ofertă bancară sau
            DAE. Calculul presupune rate egale și aceeași dobândă pe toată
            perioada. Dobânda variabilă (inclusiv IRCC + marjă), cursul valutar
            și condițiile băncii pot modifica rata. Avansul minim,
            eligibilitatea și durata acceptată sunt stabilite de bancă. Cursul
            pentru RON este orientativ și editabil.
          </p>
        </details>
      </div>
    </section>
  );
}
