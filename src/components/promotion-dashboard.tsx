"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  ChevronRight,
  Crosshair,
  Megaphone,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useWorkspace } from "./workspace-provider";
import { PromotionRadiusMap } from "./promotion-radius-map";
import { promotionRequest } from "@/lib/promotion-client";
import {
  campaignLabels,
  defaultPromotionTargetArea,
  promotionTargetArea,
  paymentLabels,
  isBucharestPromotionArea,
  promotionKeywordSuggestions,
  promotionRadii,
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

function CampaignSetup({
  properties,
  canPay,
  onUpdated,
}: {
  properties: Property[];
  canPay: boolean;
  onUpdated: () => void;
}) {
  const preview = properties.length === 0;
  const [selectedId, setSelectedId] = useState("");
  const property = properties.find((item) => item.id === selectedId);
  const [area, setArea] = useState("");
  const [radius, setRadius] = useState<number>(10);
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [offer, setOffer] = useState<PromotionPackage | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [payment, setPayment] = useState<PromotionPayment | null>(null);
  const [error, setError] = useState("");
  const zone = promotionTargetArea(area);
  const hasZone = zone.length >= 2;
  const bucharest = isBucharestPromotionArea(zone);
  const suggestions = preview
    ? promotionKeywordSuggestions(
        { type: "Condo", transaction: "sale", bedrooms: 2 },
        "București",
      )
    : property && hasZone
      ? promotionKeywordSuggestions(property, zone)
      : [];
  const keywords = suggestions.filter((keyword) =>
    selectedKeywords.includes(keyword),
  );
  const canActivate =
    canPay && property && hasZone && keywords.length > 0 && offer;
  const pack = offer ? promotionPackages[offer] : null;

  function chooseProperty(id: string) {
    setSelectedId(id);
    const listing = properties.find((item) => item.id === id);
    setArea(listing ? defaultPromotionTargetArea(listing.location) : "");
    setRadius(10);
    setSelectedKeywords([]);
    setOffer(null);
    setNotes("");
    setError("");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !canActivate || !property) return;
    setBusy(true);
    setError("");
    try {
      const data = await promotionRequest({
        propertyId: property.id,
        package: offer,
        targetArea: zone,
        keywords,
        ...(bucharest ? { radiusKm: radius } : {}),
        notes: notes.trim(),
      });
      if (data.clientSecret || data.processing) setPayment(data);
      else
        setError(
          "Formularul securizat de plată nu este disponibil. Încearcă din nou.",
        );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Plata nu a putut fi pregătită.",
      );
    } finally {
      setBusy(false);
      onUpdated();
    }
  }

  return (
    <>
      <form
        className="promotion-setup"
        onSubmit={submit}
        aria-describedby={preview ? "promotion-preview-requirement" : undefined}
      >
        <fieldset disabled={preview || busy || Boolean(payment)}>
          <section className="promotion-step">
            <h2>Proprietatea</h2>
            <div className="promotion-property-picker">
              <label>
                Ce proprietate vrei să promovezi?
                <select
                  value={selectedId}
                  onChange={(event) => chooseProperty(event.target.value)}
                >
                  <option value="">Alege o proprietate publicată</option>
                  {properties.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
              </label>
              {property && (
                <Link
                  href={publicPath(property)}
                  target="_blank"
                  className="text-button"
                >
                  Vezi pagina publicată <ArrowUpRight size={14} />
                </Link>
              )}
            </div>
          </section>
          {(property || preview) && (
            <>
              <section className="promotion-step">
                <h2>Locația</h2>
                <label>
                  Orașul și cartierul vizat
                  <input
                    required
                    minLength={2}
                    maxLength={160}
                    value={area}
                    onChange={(event) => setArea(event.target.value)}
                    onBlur={() => setArea(zone)}
                    placeholder="Ex: București, Pantelimon"
                  />
                </label>
                {(bucharest || preview) && (
                  <div className="promotion-radius-settings">
                    <label>
                      Raza de targetare
                      <select
                        value={radius}
                        onChange={(event) =>
                          setRadius(Number(event.target.value))
                        }
                      >
                        {promotionRadii.map((value) => (
                          <option key={value} value={value}>
                            {value} km
                          </option>
                        ))}
                      </select>
                    </label>
                    {bucharest && !preview && (
                      <PromotionRadiusMap radius={radius} />
                    )}
                  </div>
                )}
              </section>
              <section className="promotion-step">
                <h2>Cuvinte cheie</h2>
                {suggestions.length > 0 ? (
                  <fieldset className="promotion-keyword-options">
                    <legend>
                      {preview
                        ? "Exemple de cuvinte cheie"
                        : "Alege cel puțin o căutare pe care vrei să o vizăm."}
                    </legend>
                    {suggestions.map((keyword) => (
                      <label key={keyword}>
                        <input
                          type="checkbox"
                          checked={keywords.includes(keyword)}
                          onChange={(event) => {
                            const checked = event.target.checked;
                            setSelectedKeywords(
                              checked
                                ? [...keywords, keyword]
                                : keywords.filter((value) => value !== keyword),
                            );
                          }}
                        />
                        {keyword}
                      </label>
                    ))}
                  </fieldset>
                ) : (
                  <p>Adaugă zona pentru a vedea sugestiile.</p>
                )}
              </section>
              <section className="promotion-step">
                <h2>Bugetul</h2>
                <fieldset className="promotion-budget-options">
                  <legend>Buget publicitar total, plătit o singură dată</legend>
                  <div className="promotion-budget-choices">
                    {Object.values(promotionPackages).map((item) => (
                      <label key={item.id}>
                        <input
                          type="radio"
                          name="promotion-budget"
                          checked={offer === item.id}
                          onChange={() => setOffer(item.id)}
                        />
                        <span>{item.name}</span>
                        <strong>{item.price} RON</strong>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <details
                  className="promotion-notes"
                  inert={preview}
                  open={preview || undefined}
                >
                  <summary>Adaugă observații (opțional)</summary>
                  <label>
                    Ce ar trebui să știm despre promovare?
                    <textarea
                      rows={3}
                      maxLength={1000}
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                    />
                  </label>
                </details>
                <p className="promotion-purchase-note">
                  După confirmarea plății, echipa pregătește campania și o
                  lansează din contul Google Ads al platformei.
                </p>
                {error && (
                  <p role="alert" className="form-error">
                    {error}
                  </p>
                )}
                <button
                  className="button primary"
                  disabled={!canActivate || busy}
                >
                  {busy ? "Pregătim plata securizată…" : "Activează campania"}
                  <ChevronRight size={17} />
                </button>
              </section>
            </>
          )}
        </fieldset>
      </form>
      {payment && property && pack && (
        <PromotionDialog busy={busy} onClose={() => setPayment(null)}>
          <span className="eyebrow">PROMOVARE GOOGLE SEARCH</span>
          <h2 id="promotion-purchase-title">
            Pregătim promovarea proprietății tale.
          </h2>
          <div className="promotion-summary">
            <div>
              <strong>{property.title}</strong>
              <span>{zone}</span>
            </div>
            <div>
              <strong>{pack.price} RON</strong>
              <span>Buget publicitar · plată unică</span>
            </div>
          </div>
          <PromotionPaymentPanel
            payment={payment}
            onUpdated={onUpdated}
            onBusyChange={setBusy}
          />
        </PromotionDialog>
      )}
    </>
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
      {!published.length && (
        <div className="promotion-empty" id="promotion-preview-requirement">
          <strong>Promovarea începe cu o proprietate publicată.</strong>{" "}
          <Link href="/panou" className="text-button">
            Mergi la proprietățile mele <ArrowUpRight size={14} />
          </Link>
        </div>
      )}
      <CampaignSetup
        key={published.length ? "active" : "preview"}
        properties={published}
        canPay={!demo && enabled && !loading}
        onUpdated={refresh}
      />
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
        proprietate. Perioada campaniei se stabilește înainte de lansare.
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
    </div>
  );
}
