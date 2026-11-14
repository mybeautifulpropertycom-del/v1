"use client";

import { useId, useState, type CSSProperties } from "react";
import { ArrowRight, ChevronDown, Minus, Plus } from "lucide-react";
import type { PublicProperty } from "@/lib/model";
import { calculateMortgage } from "@/lib/mortgage";

type MortgageProperty = Pick<
  PublicProperty,
  "price" | "currency" | "transaction"
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
  const [deposit, setDeposit] = useState(20);
  const [years, setYears] = useState(30);
  const [rate, setRate] = useState("4.7");
  const [lei, setLei] = useState(false);
  const [exchange, setExchange] = useState(
    property.currency === "USD" ? "4.6" : "5",
  );
  const converting = lei && property.currency !== "RON";
  const currency = converting ? "RON" : property.currency;
  const exchangeValid =
    !converting ||
    (exchange.trim() !== "" && Number(exchange) > 0 && Number(exchange) <= 100);
  const price = property.price * (converting ? Number(exchange) : 1);
  const result =
    exchangeValid && rate.trim() !== ""
      ? calculateMortgage(price, deposit, years, Number(rate))
      : null;
  const money = (amount: number, unit = currency) =>
    new Intl.NumberFormat("ro-RO", {
      style: "currency",
      currency: unit,
      maximumFractionDigits: 0,
    }).format(amount);
  const track = (value: number) =>
    ({ "--range-progress": `${value}%` }) as CSSProperties;
  return (
    <section className="property-mortgage" aria-labelledby={`${id}-heading`}>
      <div className="mortgage-intro">
        <span className="mortgage-eyebrow">FINANȚAREA LOCUINȚEI</span>
        <h2 id={`${id}-heading`}>Fă loc planurilor tale.</h2>
        <p>O estimare a ratei, pornind de la prețul acestei proprietăți.</p>
      </div>
      <div className="mortgage-sheet">
        <div className="mortgage-overview">
          <div className="mortgage-price">
            <span className="mortgage-label">Prețul proprietății</span>
            <strong>{money(property.price, property.currency)}</strong>
            <span className="mortgage-price-note">Preluat din anunț</span>
          </div>
          <div className="mortgage-connection" aria-hidden="true">
            <span />
            <ArrowRight size={20} strokeWidth={1} />
          </div>
          <div
            className="mortgage-result"
            aria-live="polite"
            aria-atomic="true"
          >
            <div className="mortgage-result-top">
              <span className="mortgage-label">Rata lunară estimată</span>
              {property.currency !== "RON" && (
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
              )}
            </div>
            <div className="mortgage-monthly">
              <strong>
                {result
                  ? new Intl.NumberFormat("ro-RO", {
                      maximumFractionDigits: 0,
                    }).format(result.monthly)
                  : "—"}
              </strong>
              <span>
                {currency}
                <small>/ lună</small>
              </span>
            </div>
          </div>
        </div>
        <div className="mortgage-controls">
          <div className="mortgage-field">
            <label className="mortgage-label" htmlFor={`${id}-deposit`}>
              Avansul tău
            </label>
            <div className="mortgage-field-value">
              <strong>
                {deposit}
                <small>%</small>
              </strong>
              <span>{result ? money(result.deposit) : "—"}</span>
            </div>
            <input
              id={`${id}-deposit`}
              aria-valuetext={`${deposit}%`}
              type="range"
              min="0"
              max="100"
              step="1"
              value={deposit}
              style={track(deposit)}
              onChange={(e) => setDeposit(Number(e.target.value))}
            />
            <div className="mortgage-range-ends">
              <span>0%</span>
              <span>100%</span>
            </div>
          </div>
          <div className="mortgage-field">
            <label className="mortgage-label" htmlFor={`${id}-years`}>
              Perioada creditului
            </label>
            <div className="mortgage-field-value">
              <strong>
                {years}
                <small>ani</small>
              </strong>
              <span>{years * 12} de rate</span>
            </div>
            <input
              id={`${id}-years`}
              type="range"
              min="5"
              max="35"
              step="1"
              value={years}
              style={track(((years - 5) / 30) * 100)}
              onChange={(e) => setYears(Number(e.target.value))}
            />
            <div className="mortgage-range-ends">
              <span>5 ani</span>
              <span>35 de ani</span>
            </div>
          </div>
          <div className="mortgage-field mortgage-rate-field">
            <label className="mortgage-label" htmlFor={`${id}-rate`}>
              Dobândă anuală
            </label>
            <div className="mortgage-rate-line">
              <div className="mortgage-rate-value">
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
              <div className="mortgage-step-buttons">
                <button
                  type="button"
                  aria-label="Scade dobânda"
                  onClick={() =>
                    setRate(
                      String(
                        Math.max(
                          0,
                          Math.round((Number(rate || 0) - 0.25) * 100) / 100,
                        ),
                      ),
                    )
                  }
                >
                  <Minus size={15} />
                </button>
                <button
                  type="button"
                  aria-label="Crește dobânda"
                  onClick={() =>
                    setRate(
                      String(
                        Math.min(
                          30,
                          Math.round((Number(rate || 0) + 0.25) * 100) / 100,
                        ),
                      ),
                    )
                  }
                >
                  <Plus size={15} />
                </button>
              </div>
            </div>
            <span className="mortgage-rate-note">
              Ajustabilă · presupusă constantă
            </span>
          </div>
        </div>
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
              aria-describedby={`${id}-exchange-note`}
            />
            <small id={`${id}-exchange-note`}>
              Curs orientativ, introdus manual. Nu este preluat de la BNR sau de
              la o bancă.
            </small>
          </div>
        )}
        {!result && (
          <p className="mortgage-validation" role="alert">
            Introdu o dobândă între 0 și 30% și un curs valid pentru a vedea
            estimarea.
          </p>
        )}
        {deposit === 100 && (
          <p className="mortgage-paid-note">
            Cu avans integral, nu mai este necesar un credit.
          </p>
        )}
        <details className="mortgage-details">
          <summary>
            <span>Vezi detaliile simulării</span>
            <ChevronDown size={16} strokeWidth={1.5} aria-hidden="true" />
          </summary>
          <dl>
            <div>
              <dt>Suma împrumutată</dt>
              <dd>{result ? money(result.principal) : "—"}</dd>
            </div>
            <div>
              <dt>Dobândă totală</dt>
              <dd>{result ? money(result.interest) : "—"}</dd>
            </div>
            <div>
              <dt>
                Total de rambursat{" "}
                <small>Fără avans și costuri suplimentare</small>
              </dt>
              <dd>{result ? money(result.total) : "—"}</dd>
            </div>
          </dl>
          <p className="mortgage-disclaimer">
            Calcul cu rate lunare egale, avans de {deposit}% și dobândă anuală
            de {rate || "—"}%, presupusă constantă pe {years} ani. Dobânda
            inițială de 4,7% este un exemplu, nu o ofertă bancară și nu
            reprezintă DAE. Nu sunt incluse comisioane, asigurări, taxe
            notariale sau alte costuri. Dobânda variabilă (inclusiv IRCC +
            marjă), cursul valutar și condițiile băncii pot modifica rata.
            Avansul minim și perioada acceptată sunt stabilite de bancă.
          </p>
        </details>
      </div>
      <p className="mortgage-footnote">
        Estimare orientativă, fără comisioane și asigurări incluse. Nu
        reprezintă o ofertă de credit sau o confirmare a eligibilității.
      </p>
    </section>
  );
}
