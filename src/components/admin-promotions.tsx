"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { useWorkspace } from "./workspace-provider";
import { adminRequest } from "@/lib/admin-client";
import {
  campaignLabels,
  paymentLabels,
  promotionStopLabels,
  type PromotionCampaignStatus,
  type PromotionOrder,
} from "@/lib/promotion-packages";

function Campaign({
  order,
  onUpdated,
}: {
  order: PromotionOrder;
  onUpdated: (order: PromotionOrder) => void;
}) {
  const [status, setStatus] = useState<PromotionCampaignStatus>(
    order.campaign_status,
  );
  const [spent, setSpent] = useState(String(order.spent_amount / 100));
  const [impressions, setImpressions] = useState(String(order.impressions)),
    [clicks, setClicks] = useState(String(order.clicks));
  const [report, setReport] = useState(order.report),
    [campaignId, setCampaignId] = useState(order.campaign_id);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  const canEdit =
    order.livemode &&
    ["paid", "refunded", "disputed"].includes(order.payment_status);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const data = await adminRequest("promotions", {
        orderId: order.id,
        status,
        spentAmount: Math.round(Number(spent) * 100),
        impressions: Number(impressions),
        clicks: Number(clicks),
        report,
        campaignId,
      });
      onUpdated(data.order);
      setSaved(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Raportul nu a putut fi salvat.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="promotion-admin-order">
      <div className="promotion-order-heading">
        <div>
          <h2>{order.snapshot.title}</h2>
          <p>{order.snapshot.location}</p>
        </div>
        <strong>{(order.amount / 100).toLocaleString("ro-RO")} RON</strong>
      </div>
      <div className="promotion-order-status">
        <span>{paymentLabels[order.payment_status]}</span>
        <span>{campaignLabels[order.campaign_status]}</span>
        {!order.livemode && (
          <span className="promotion-test">Test — nu lansa o campanie</span>
        )}
      </div>
      {order.stop_required && (
        <p role="alert" className="form-error">
          Promovarea necesită oprire sau verificare:{" "}
          {order.stop_reason
            ? promotionStopLabels[order.stop_reason]
            : "plata sau pagina proprietății s-a schimbat"}
          . Verifică și oprește campania în Google Ads, apoi confirmă starea
          „Campanie oprită” aici.
        </p>
      )}
      <dl className="promotion-admin-details">
        <div>
          <dt>Agent</dt>
          <dd>{order.snapshot.name}</dd>
        </div>
        <div>
          <dt>E-mail</dt>
          <dd>{order.snapshot.email}</dd>
        </div>
        <div>
          <dt>Telefon</dt>
          <dd>{order.snapshot.phone || "—"}</dd>
        </div>
        <div>
          <dt>Zona cerută</dt>
          <dd>{order.target_area}</dd>
        </div>
        {order.snapshot.radius_km && (
          <div>
            <dt>Raza de targetare</dt>
            <dd>
              {order.snapshot.radius_km} km în jurul centrului Bucureștiului
            </dd>
          </div>
        )}
        <div>
          <dt>Comandă</dt>
          <dd>{order.id}</dd>
        </div>
        <div>
          <dt>Data</dt>
          <dd>{new Date(order.created_at).toLocaleString("ro-RO")}</dd>
        </div>
      </dl>
      <p>
        <a
          href={order.snapshot.public_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-button"
        >
          Deschide prezentarea proprietății <ExternalLink size={13} />
        </a>
      </p>
      <p className="promotion-tracking-link">
        Link pentru anunț:{" "}
        <input
          aria-label={`Link de campanie pentru ${order.snapshot.title}`}
          readOnly
          value={`${order.snapshot.public_url}${order.snapshot.public_url.includes("?") ? "&" : "?"}utm_source=google&utm_medium=cpc&utm_campaign=promovare_${order.id}`}
          onFocus={(event) => event.target.select()}
        />
      </p>
      <div className="promotion-keywords">
        <span>Cuvinte cheie din comandă</span>
        {order.snapshot.keywords.map((keyword) => (
          <small key={keyword}>{keyword}</small>
        ))}
      </div>
      {order.notes && (
        <p className="promotion-report">
          <strong>Observațiile agentului:</strong> {order.notes}
        </p>
      )}
      <p className="promotion-muted">
        Campania se configurează și se modifică manual în contul vostru Google
        Ads. Actualizează mai jos starea și rezultatele reale, după efectuarea
        schimbărilor în Google.
      </p>
      <form onSubmit={save}>
        <fieldset disabled={busy || !canEdit}>
          <div className="field-grid">
            <label>
              Starea campaniei
              <select
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as PromotionCampaignStatus)
                }
              >
                {Object.entries(campaignLabels).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              ID campanie Google Ads
              <input
                value={campaignId}
                required={status === "active"}
                maxLength={128}
                onChange={(event) => setCampaignId(event.target.value)}
              />
            </label>
            <label>
              Buget folosit (RON)
              <input
                type="number"
                min={0}
                max={order.amount / 100}
                step="0.01"
                required
                value={spent}
                onChange={(event) => setSpent(event.target.value)}
              />
            </label>
            <label>
              Afișări
              <input
                type="number"
                min={0}
                max={2147483647}
                required
                value={impressions}
                onChange={(event) => setImpressions(event.target.value)}
              />
            </label>
            <label>
              Clicuri
              <input
                type="number"
                min={0}
                max={2147483647}
                required
                value={clicks}
                onChange={(event) => setClicks(event.target.value)}
              />
            </label>
            <label className="full-width">
              Raport vizibil pentru agent
              <textarea
                rows={4}
                required={status === "completed"}
                maxLength={2000}
                value={report}
                onChange={(event) => setReport(event.target.value)}
              />
            </label>
          </div>
          <button className="button primary" disabled={!canEdit || busy}>
            {busy ? "Salvăm raportul…" : "Salvează starea și raportul"}
          </button>
        </fieldset>
      </form>
      {order.payment_status !== "paid" && canEdit && (
        <small>
          Pentru o plată rambursată sau contestată poți confirma doar oprirea
          campaniei.
        </small>
      )}
      {order.refunded_amount > 0 && (
        <p>
          Rambursat în Stripe:{" "}
          {(order.refunded_amount / 100).toLocaleString("ro-RO")} RON.
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {saved && <p role="status">Starea și raportul au fost salvate.</p>}
    </article>
  );
}
export function AdminPromotions() {
  const { isAdmin } = useWorkspace();
  const [orders, setOrders] = useState<PromotionOrder[]>([]),
    [total, setTotal] = useState(0);
  const [mode, setMode] = useState("live"),
    [status, setStatus] = useState("all"),
    [page, setPage] = useState(0),
    [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    setLoading(true);
    setError("");
    void adminRequest(
      `promotions?${new URLSearchParams({ mode, status, page: String(page) })}`,
    )
      .then((data) => {
        if (active) {
          setOrders(data.orders);
          setTotal(data.total);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isAdmin, mode, status, page, revision]);
  if (!isAdmin)
    return (
      <div className="state-screen">
        <h1>Este necesar accesul de administrator.</h1>
        <Link href="/panou">Înapoi la panou</Link>
      </div>
    );
  return (
    <section className="promotion-admin">
      <Link className="back-link" href="/panou/administrare">
        <ArrowLeft size={15} /> Înapoi la administrare
      </Link>
      <div className="page-heading compact">
        <div>
          <span className="eyebrow">COMENZI DE PROMOVARE</span>
          <h1>Campaniile proprietăților.</h1>
          <p>
            Verifică plățile, pregătește campaniile în Google Ads și comunică
            starea și rezultatele agenților.
          </p>
        </div>
      </div>
      <div className="admin-controls">
        <label>
          Plăți
          <select
            value={mode}
            onChange={(event) => {
              setMode(event.target.value);
              setPage(0);
            }}
          >
            <option value="live">Doar comenzi reale</option>
            <option value="all">Inclusiv comenzi de test</option>
          </select>
        </label>
        <label>
          Stare
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(0);
            }}
          >
            <option value="all">Toate comenzile</option>
            <option value="paid">Plăți confirmate</option>
            <option value="attention">Necesită verificare</option>
          </select>
        </label>
        <button
          type="button"
          className="button secondary"
          onClick={() => setRevision((value) => value + 1)}
        >
          Actualizează
        </button>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {loading ? (
        <p>Încărcăm comenzile…</p>
      ) : orders.length ? (
        orders.map((order) => (
          <Campaign
            key={order.id}
            order={order}
            onUpdated={(updated) =>
              setOrders((current) =>
                current.map((item) =>
                  item.id === updated.id ? updated : item,
                ),
              )
            }
          />
        ))
      ) : (
        <div className="promotion-empty">
          Nu există comenzi pentru filtrele alese.
        </div>
      )}
      <div className="promotion-pagination">
        <button
          className="button secondary"
          disabled={!page || loading}
          onClick={() => setPage((value) => value - 1)}
        >
          Înapoi
        </button>
        <span>
          {total} comenzi · pagina {page + 1}
        </span>
        <button
          className="button secondary"
          disabled={(page + 1) * 20 >= total || loading}
          onClick={() => setPage((value) => value + 1)}
        >
          Înainte
        </button>
      </div>
    </section>
  );
}
