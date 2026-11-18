"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  Crosshair,
  Megaphone,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useWorkspace } from "./workspace-provider";
import { promotionRequest } from "@/lib/promotion-client";
import {
  campaignLabels,
  defaultPromotionTargetArea,
  promotionTargetArea,
  paymentLabels,
  promotionKeywords,
  promotionPackages,
  promotionStopLabels,
  type PromotionOrder,
  type PromotionPackage,
} from "@/lib/promotion-packages";
import { publicPath, type Property } from "@/lib/model";
import {
  PromotionDialog,
  PromotionPaymentPanel,
  type PromotionPayment,
} from "./promotion-payment";

function Purchase({
  property,
  offer,
  onClose,
  onUpdated,
}: {
  property: Property;
  offer: PromotionPackage;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [payment, setPayment] = useState<PromotionPayment | null>(null);
  const [area, setArea] = useState(
    defaultPromotionTargetArea(property.location),
  );
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pack = promotionPackages[offer];
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const data = await promotionRequest({
        propertyId: property.id,
        package: offer,
        targetArea: promotionTargetArea(area),
        notes: notes.trim(),
      });
      onUpdated();
      if (data.clientSecret || data.processing) setPayment(data);
      else
        setError(
          "Formularul securizat de plată nu este disponibil. Încearcă din nou.",
        );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Plata nu a putut fi pregătită.",
      );
      onUpdated();
    } finally {
      setBusy(false);
    }
  }
  return (
    <PromotionDialog busy={busy} onClose={onClose}>
      <span className="eyebrow">PROMOVARE GOOGLE SEARCH</span>
      <h2 id="promotion-purchase-title">
        Pregătim promovarea proprietății tale.
      </h2>
      <div className="promotion-summary">
        <div>
          <strong>{property.title}</strong>
          <span>{property.location}</span>
        </div>
        <div>
          <strong>{pack.price.toLocaleString("ro-RO")} RON</strong>
          <span>Pachet {pack.name} · buget Google Ads</span>
        </div>
      </div>
      {payment ? (
        <PromotionPaymentPanel
          payment={payment}
          onUpdated={onUpdated}
          onBusyChange={setBusy}
        />
      ) : (
        <form onSubmit={submit}>
          <fieldset disabled={busy}>
            <label>
              Zona în care vrei să promovezi
              <input
                required
                minLength={2}
                maxLength={160}
                value={area}
                onChange={(event) => setArea(event.target.value)}
                onBlur={() => setArea(promotionTargetArea(area))}
                placeholder="Ex: Brașov și împrejurimi"
              />
              <small>
                Alegem direcționarea împreună, înainte de lansarea campaniei.
              </small>
            </label>
            <div className="promotion-keywords">
              <span>Căutări de la care putem porni</span>
              {promotionKeywords(
                property,
                promotionTargetArea(area) || "zona aleasă",
              ).map((keyword) => (
                <small key={keyword}>{keyword}</small>
              ))}
            </div>
            <label>
              Ce ar trebui să știm despre promovare?{" "}
              <span className="promotion-optional">Opțional</span>
              <textarea
                rows={3}
                maxLength={1000}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Zone prioritare, ce vrei să evidențiem sau alte detalii utile."
              />
            </label>
            <p className="promotion-purchase-note">
              Întreaga sumă este buget publicitar. Configurarea și administrarea
              sunt incluse. După confirmarea plății, te contactăm pentru
              detaliile campaniei și o lansăm manual din contul nostru Google
              Ads. Este o plată unică. Perioada campaniei se stabilește înainte
              de lansare, în funcție de buget și costurile căutărilor.
            </p>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <button
              className="button primary full-button"
              disabled={busy || promotionTargetArea(area).length < 2}
            >
              {busy ? "Pregătim plata securizată…" : "Continuă la plată"}
              <ChevronRight size={17} />
            </button>
          </fieldset>
        </form>
      )}
    </PromotionDialog>
  );
}

function OrderCard({
  order,
  mode,
  onRefresh,
}: {
  order: PromotionOrder;
  mode: string;
  onRefresh: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [payment, setPayment] = useState<PromotionPayment | null>(null);
  const [stopForm, setStopForm] = useState(false),
    [stopReason, setStopReason] = useState("");
  const campaign =
    order.payment_status === "paid"
      ? campaignLabels[order.campaign_status]
      : paymentLabels[order.payment_status];
  async function action(
    kind: "resume" | "cancel" | "request_stop",
    reason?: string,
  ) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const data = await promotionRequest({
        action: kind,
        orderId: order.id,
        ...(reason ? { reason } : {}),
      });
      if (data.requested) setStopForm(false);
      if (kind === "resume" && (data.clientSecret || data.processing))
        setPayment(data);
      onRefresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Comanda nu a putut fi actualizată.",
      );
      onRefresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="promotion-order">
      {payment && (
        <PromotionDialog
          busy={busy}
          onClose={() => {
            setPayment(null);
            onRefresh();
          }}
        >
          <span className="eyebrow">PROMOVARE GOOGLE SEARCH</span>
          <h2 id="promotion-purchase-title">Continuă plata promovării.</h2>
          <div className="promotion-summary">
            <div>
              <strong>{order.snapshot.title}</strong>
              <span>{promotionTargetArea(order.target_area)}</span>
            </div>
            <div>
              <strong>
                {(order.amount / 100).toLocaleString("ro-RO")} RON
              </strong>
              <span>Buget Google Ads</span>
            </div>
          </div>
          <PromotionPaymentPanel
            payment={payment}
            onUpdated={onRefresh}
            onBusyChange={setBusy}
          />
        </PromotionDialog>
      )}
      <div className="promotion-order-heading">
        <div>
          <h3>{order.snapshot.title}</h3>
          <p>
            {promotionTargetArea(order.target_area)} ·{" "}
            {new Date(order.created_at).toLocaleDateString("ro-RO")}
          </p>
        </div>
        <strong>{(order.amount / 100).toLocaleString("ro-RO")} RON</strong>
      </div>
      <div className="promotion-order-status">
        <span>{campaign}</span>
        {!order.livemode && (
          <span className="promotion-test">
            Comandă de test — fără buget real
          </span>
        )}
      </div>
      {order.stop_required && (
        <p className="form-error">
          Oprirea promovării este în verificare. Echipa trebuie să verifice și
          să oprească manual campania în Google Ads.
        </p>
      )}
      {order.stop_reason && <p>{promotionStopLabels[order.stop_reason]}</p>}
      {order.payment_status === "paid" &&
        !order.stop_required &&
        order.campaign_status === "queued" && (
          <p>
            Am primit comanda. Echipa pregătește detaliile și te contactează
            înainte de lansare.
          </p>
        )}
      {(order.campaign_status === "active" ||
        order.campaign_status === "completed" ||
        order.report) && (
        <div className="promotion-results">
          <span>
            <strong>{order.impressions.toLocaleString("ro-RO")}</strong>Afișări
          </span>
          <span>
            <strong>{order.clicks.toLocaleString("ro-RO")}</strong>Clicuri
          </span>
          <span>
            <strong>
              {(order.spent_amount / 100).toLocaleString("ro-RO")} RON
            </strong>
            Buget folosit
          </span>
        </div>
      )}
      {order.report && <p className="promotion-report">{order.report}</p>}
      {order.refunded_amount > 0 && (
        <p>
          Sumă rambursată:{" "}
          {(order.refunded_amount / 100).toLocaleString("ro-RO")} RON.
        </p>
      )}
      {order.payment_status === "pending" &&
        order.livemode === (mode === "live") && (
          <div className="promotion-order-actions">
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => void action("resume")}
            >
              Continuă plata
            </button>
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => void action("cancel")}
            >
              Anulează plata în așteptare
            </button>
          </div>
        )}
      {order.livemode &&
        order.payment_status === "paid" &&
        !order.stop_required &&
        ["queued", "preparing", "active"].includes(order.campaign_status) && (
          <div className="promotion-stop-request">
            {!stopForm ? (
              <button
                type="button"
                className="text-button"
                onClick={() => setStopForm(true)}
              >
                Solicită oprirea promovării
              </button>
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void action("request_stop", stopReason);
                }}
              >
                <p>
                  Proprietatea s-a vândut, s-a închiriat sau nu mai dorești
                  promovare? Trimite motivul echipei, care va opri manual
                  campania în Google Ads.
                </p>
                <label>
                  Motivul opririi
                  <select
                    required
                    value={stopReason}
                    disabled={busy}
                    onChange={(event) => setStopReason(event.target.value)}
                  >
                    <option value="" disabled>
                      Alege motivul
                    </option>
                    <option value="sold">Proprietatea s-a vândut</option>
                    <option value="rented">Proprietatea s-a închiriat</option>
                    <option value="requested">Nu mai doresc promovarea</option>
                  </select>
                </label>
                <div className="promotion-order-actions">
                  <button
                    className="button secondary"
                    disabled={busy || !stopReason}
                  >
                    Trimite solicitarea de oprire
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy}
                    onClick={() => setStopForm(false)}
                  >
                    Renunță
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </article>
  );
}

export function PromotionDashboard() {
  const { properties, demo } = useWorkspace();
  const published = properties.filter(
    (property) => property.status === "published",
  );
  const [selectedId, setSelectedId] = useState(published[0]?.id || "");
  const selected =
    published.find((property) => property.id === selectedId) ?? published[0];
  const [offer, setOffer] = useState<PromotionPackage | null>(null);
  const [orders, setOrders] = useState<PromotionOrder[]>([]);
  const [mode, setMode] = useState("off"),
    [enabled, setEnabled] = useState(false),
    [loading, setLoading] = useState(!demo),
    [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [returned, setReturned] = useState<"success" | "cancelled" | null>(
    null,
  );
  const refresh = () => setRevision((value) => value + 1);
  useEffect(() => {
    const value = new URLSearchParams(location.search).get("payment");
    if (value === "success" || value === "cancelled") setReturned(value);
  }, []);
  useEffect(() => {
    if (demo) return;
    let active = true;
    void promotionRequest()
      .then((data) => {
        if (!active) return;
        setOrders(data.orders);
        setEnabled(data.enabled);
        setMode(data.mode);
        setError("");
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setEnabled(false);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [demo, revision]);
  useEffect(() => {
    if (returned !== "success") return;
    const timer = setInterval(refresh, 4000);
    const timeout = setTimeout(() => clearInterval(timer), 60000);
    return () => {
      clearInterval(timer);
      clearTimeout(timeout);
    };
  }, [returned]);
  return (
    <div className="promotion-page">
      <div className="page-heading compact">
        <div>
          <span className="eyebrow">PROMOVARE PENTRU PROPRIETĂȚI</span>
          <h1 data-guide-promotions>Fii prezent în căutările potrivite.</h1>
          <p>
            Promovăm site-ul proprietății în Google Search, cu anunțuri și
            cuvinte cheie pentru ceea ce vinzi sau închiriezi, în zona aleasă.
          </p>
        </div>
      </div>
      <div className="promotion-budget-note">
        <Megaphone size={22} />
        <div>
          <strong>Bugetul ales merge integral în Google Ads.</strong>
          <p>
            Configurarea și administrarea campaniei sunt incluse, fără cost
            suplimentar.
          </p>
        </div>
      </div>
      {returned && (
        <p className="promotion-return" role="status">
          {returned === "success"
            ? "Ai revenit din Stripe. Starea comenzii se actualizează după confirmarea plății."
            : "Ai revenit fără să finalizezi plata. O poți continua sau anula din comenzile tale."}
        </p>
      )}
      {selected ? (
        <div className="promotion-property-picker">
          <label>
            Ce proprietate vrei să promovezi?
            <select
              value={selected.id}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              {published.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.title}
                </option>
              ))}
            </select>
          </label>
          <Link
            href={publicPath(selected)}
            target="_blank"
            className="text-button"
          >
            Vezi pagina publicată <ArrowUpRight size={14} />
          </Link>
        </div>
      ) : (
        <div className="promotion-empty">
          <strong>Promovarea începe cu o proprietate publicată.</strong>
          <p>
            Compară bugetele mai jos, apoi publică site-ul proprietății pentru a
            putea pregăti campania.
          </p>
          <Link href="/panou" className="text-button">
            Mergi la proprietățile mele <ArrowUpRight size={14} />
          </Link>
        </div>
      )}
      <div className="promotion-packages">
        {Object.values(promotionPackages).map((pack) => (
          <article
            className={`promotion-package ${pack.id === "plus" ? "featured" : ""}`}
            key={pack.id}
          >
            <div className="promotion-package-top">
              <span>Pachet {pack.name}</span>
              {pack.id === "plus" && <small>Recomandat</small>}
            </div>
            <div className="promotion-price">
              {pack.price.toLocaleString("ro-RO")} <span>RON</span>
            </div>
            <p className="promotion-price-caption">
              buget publicitar · plată unică
            </p>
            <p className="promotion-package-description">{pack.description}</p>
            <ul>
              {[
                "Campanie în Google Search",
                "Cuvinte cheie adaptate proprietății",
                "Anunțuri pentru vânzare sau închiriere",
                "Direcționare în zona aleasă",
                "Monitorizare și ajustări",
                "Raport cu afișări, clicuri și buget folosit",
              ].map((feature) => (
                <li key={feature}>
                  <Check size={15} />
                  {feature}
                </li>
              ))}
            </ul>
            <button
              type="button"
              className={`button ${pack.id === "plus" ? "primary" : "secondary"}`}
              disabled={!selected || demo || !enabled || loading}
              onClick={() => setOffer(pack.id)}
            >
              Alege pachetul {pack.name}
              <ChevronRight size={16} />
            </button>
          </article>
        ))}
      </div>
      {!loading && !enabled && (
        <p className="promotion-muted">
          {demo
            ? "Explorezi pachetele în modul demonstrativ. Plata este disponibilă într-un cont conectat."
            : "Plata promovării nu este disponibilă momentan."}
        </p>
      )}
      {mode === "test" && (
        <p className="promotion-return">
          Plățile sunt în modul de test. Nu se încasează bani și nu se lansează
          campanii reale.
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}{" "}
          <button type="button" className="text-button" onClick={refresh}>
            Reîncearcă
          </button>
        </p>
      )}
      <div className="promotion-how">
        <article>
          <Search size={22} />
          <h3>Pornim de la căutări relevante.</h3>
          <p>
            Selectăm cuvinte cheie pentru tipul proprietății, tranzacție și
            localitate. De exemplu, „apartament de vânzare Brașov”.
          </p>
        </article>
        <article>
          <Crosshair size={22} />
          <h3>Trimitem oamenii către prezentarea ta.</h3>
          <p>
            Anunțul duce la site-ul publicat al proprietății, unde vizitatorii
            pot vedea fotografiile și trimite o cerere de vizionare.
          </p>
        </article>
        <article>
          <SlidersHorizontal size={22} />
          <h3>Pregătim și urmărim campania.</h3>
          <p>
            Stabilim detaliile înainte de lansare, monitorizăm bugetul și îți
            oferim un raport la încheiere.
          </p>
        </article>
      </div>
      <p className="promotion-disclaimer">
        Costul clicurilor și rezultatele depind de cerere, concurență, zonă și
        proprietate. Nu garantăm o anumită poziție în Google, un număr de
        vizitatori sau de solicitări. Perioada campaniei se stabilește înainte
        de lansare.
      </p>
      <section
        className="promotion-history"
        aria-labelledby="promotion-history-title"
      >
        <div>
          <h2 id="promotion-history-title">Promovările tale</h2>
          <button type="button" className="text-button" onClick={refresh}>
            Actualizează
          </button>
        </div>
        {loading ? (
          <p>Încărcăm comenzile…</p>
        ) : orders.length ? (
          orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              mode={mode}
              onRefresh={refresh}
            />
          ))
        ) : (
          <p className="promotion-muted">
            Aici vei vedea comenzile, starea campaniilor și rapoartele de
            promovare.
          </p>
        )}
      </section>
      {offer && selected && (
        <Purchase
          property={selected}
          offer={offer}
          onClose={() => setOffer(null)}
          onUpdated={refresh}
        />
      )}
    </div>
  );
}
