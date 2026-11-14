"use client";

import { useId, useState } from "react";
import { ArrowUpRight, Minus, Plus } from "lucide-react";
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
  return (
    <section className="property-mortgage" aria-labelledby={`${id}-heading`}>
      <div className="mortgage-intro">
        <span className="mortgage-eyebrow">UN PAS MAI APROAPE DE ACASĂ</span>
        <h2 id={`${id}-heading`}>
          Un loc al tău.
          <br />
          <em>Un plan pe măsura ta.</em>
        </h2>
        <p>
          Descoperă cum ar putea arăta rata pentru această proprietate.
          Ajustează cifrele și găsește un punct de plecare.
        </p>
      </div>
      <div className="mortgage-layout">
        <div className="mortgage-controls">
          <div className="mortgage-price">
            <div>
              <span>Prețul proprietății</span>
              <strong>{money(property.price, property.currency)}</strong>
            </div>
            <span className="mortgage-price-note">Preluat din anunț</span>
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
                aria-describedby={`${id}-exchange-note`}
              />
              <small id={`${id}-exchange-note`}>
                Curs orientativ, introdus manual. Nu este preluat de la BNR sau
                de la o bancă.
              </small>
            </div>
          )}
          <div className="mortgage-control">
            <div className="mortgage-control-title">
              <label htmlFor={`${id}-deposit`}>Avansul tău</label>
              <strong>
                {deposit}% <span>· {result ? money(result.deposit) : "—"}</span>
              </strong>
            </div>
            <input
              id={`${id}-deposit`}
              type="range"
              min="0"
              max="100"
              step="1"
              value={deposit}
              onChange={(e) => setDeposit(Number(e.target.value))}
            />
            <div className="mortgage-range-ends">
              <span>0%</span>
              <span>100%</span>
            </div>
          </div>
          <div className="mortgage-control">
            <div className="mortgage-control-title">
              <label htmlFor={`${id}-years`}>Perioada creditului</label>
              <strong>{years} de ani</strong>
            </div>
            <input
              id={`${id}-years`}
              type="range"
              min="5"
              max="35"
              step="1"
              value={years}
              onChange={(e) => setYears(Number(e.target.value))}
            />
            <div className="mortgage-range-ends">
              <span>5 ani</span>
              <span>35 de ani</span>
            </div>
          </div>
          <div className="mortgage-interest-control">
            <label htmlFor={`${id}-rate`}>
              Dobândă anuală <small>Nominală, presupusă constantă</small>
            </label>
            <div className="mortgage-stepper">
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
          {!result && (
            <p className="mortgage-validation" role="alert">
              Introdu o dobândă între 0 și 30% și un curs valid pentru a vedea
              estimarea.
            </p>
          )}
        </div>
        <div className="mortgage-result" aria-live="polite" aria-atomic="true">
          <span className="mortgage-eyebrow">RATA LUNARĂ ESTIMATĂ</span>
          <div className="mortgage-monthly">
            <strong>
              {result
                ? new Intl.NumberFormat("ro-RO", {
                    maximumFractionDigits: 0,
                  }).format(result.monthly)
                : "—"}
            </strong>
            <span>{currency} / lună</span>
          </div>
          <p className="mortgage-result-caption">
            {deposit === 100
              ? "Cu avans integral, nu mai este necesar un credit."
              : `O simulare pentru ${years} de ani, cu rate egale.`}
          </p>
          <dl>
            <div>
              <dt>Suma împrumutată</dt>
              <dd>{result ? money(result.principal) : "—"}</dd>
            </div>
            <div>
              <dt>Dobândă totală</dt>
              <dd>{result ? money(result.interest) : "—"}</dd>
            </div>
            <div className="mortgage-total">
              <dt>
                Total de rambursat <small>Credit + dobândă, fără avans</small>
              </dt>
              <dd>{result ? money(result.total) : "—"}</dd>
            </div>
          </dl>
          <div className="mortgage-composition" aria-hidden="true">
            <span
              style={{
                width: `${result && result.total > 0 ? (result.principal / result.total) * 100 : 100}%`,
              }}
            />
          </div>
          <div className="mortgage-legend">
            <span>Suma împrumutată</span>
            <span>Dobândă</span>
          </div>
          <p className="mortgage-result-footer">
            Cifrele conturează planul.
            <br />
            Vizionarea îți spune restul.{" "}
            <ArrowUpRight size={22} aria-hidden="true" />
          </p>
        </div>
      </div>
      <p className="mortgage-disclaimer">
        Simulare orientativă, nu ofertă de credit sau confirmare a
        eligibilității. Dobânda inițială de 4,7% este un exemplu, nu o ofertă
        bancară și nu reprezintă DAE. Calculul nu include comisioane, asigurări,
        taxe notariale sau alte costuri. Dobânda variabilă (inclusiv IRCC +
        marjă), cursul valutar și condițiile băncii pot modifica rata. Avansul
        minim și perioada acceptată sunt stabilite de bancă.
      </p>
    </section>
  );
}
