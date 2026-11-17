"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { adminRequest } from "@/lib/admin-client";
import {
  type Property,
  type Profile,
  publicationErrors,
  publicPath,
} from "@/lib/model";
import { useWorkspace } from "./workspace-provider";
import { PropertyWebsite } from "./property-website";
import { PropertyVideoProgressPanel } from "./property-video-progress";
import { PublicationPackagePicker } from "./publication-package-picker";
import {
  publicationPackages,
  type PublicationPackage,
} from "@/lib/publication-packages";

type Detail = {
  property: Property;
  profile: Profile;
  grant: { reason: string; granted_at: string } | null;
  videoIncluded?: boolean;
  packageLocked?: boolean;
  video: {
    status: string;
    activeScenes?: number;
    provider?: string;
    nextProvider?: string;
    attempts: number;
    canRebuild?: boolean;
    canResume?: boolean;
    durationRepair?: {
      usd: number;
      generatedSeconds: number;
      error?: string;
    } | null;
    rebuildUsesCredits?: boolean;
    completed: number;
    total: number;
    costEstimate?: {
      usd: number;
      limitUsd: number;
      generatedSeconds: number;
      finalSeconds: number;
    } | null;
    error: string | null;
    film: { src: string; poster?: string } | null;
  } | null;
};
export function AdminProperty({ id }: { id: string }) {
  const { isAdmin } = useWorkspace();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState(
    "Publicare gratuită aprobată de administrator",
  );
  const [notice, setNotice] = useState("");
  const [selectedPackage, setSelectedPackage] =
    useState<PublicationPackage>("photos");
  const refresh = useCallback(async () => {
    const next = await adminRequest(`properties?id=${encodeURIComponent(id)}`);
    setData(next);
    if (next.packageLocked || next.grant || next.video)
      setSelectedPackage(next.videoIncluded === false ? "photos" : "video");
    if (next.video?.error || next.video?.status === "failed") setNotice("");
  }, [id]);
  useEffect(() => {
    if (isAdmin) void refresh().catch((e) => setError(e.message));
  }, [isAdmin, refresh]);
  useEffect(() => {
    if (!data?.video || !["queued", "processing"].includes(data.video.status))
      return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible")
        void refresh().catch(() => {});
    }, 15000);
    return () => clearInterval(timer);
  }, [data?.video?.status, refresh]);
  if (!isAdmin)
    return (
      <div className="state-screen">
        <h1>Este necesar accesul de administrator.</h1>
        <Link href="/panou">Înapoi la spațiul de lucru</Link>
      </div>
    );
  async function publish() {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await adminRequest("publish", {
        propertyId: id,
        reason,
        package: selectedPackage,
      });
      await refresh();
      setNotice(
        (result.videoIncluded ??
          publicationPackages[selectedPackage].includesVideo)
          ? "Proprietatea este publică. Filmul va apărea când este gata. Publicarea nu a încasat nicio plată; generarea folosește credite API."
          : "Proprietatea este publică, fără videoclip. Nu s-a efectuat nicio plată și nu s-a pornit generarea video.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publicare indisponibilă.");
    } finally {
      setBusy(false);
    }
  }
  async function rebuildFilm() {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await adminRequest("rebuild-film", { propertyId: id });
      await refresh();
      setNotice(
        "Noul film este în coadă. Filmul actual rămâne disponibil până când cel nou este gata. Nu este necesară o nouă plată pentru proprietate.",
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Filmul nu a putut fi adăugat în coadă.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function resumeFilm(repairDuration = false) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await adminRequest(
        repairDuration ? "repair-film-duration" : "resume-film",
        { propertyId: id },
      );
      await refresh();
      setNotice(
        "Filmul se reia de la scena respinsă. Scenele finalizate sunt păstrate; generarea celor rămase folosește credite API.",
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Reluarea nu este disponibilă.",
      );
    } finally {
      setBusy(false);
    }
  }
  const issues = data ? publicationErrors(data.property, data.profile) : [];
  return (
    <>
      <section className="admin-property-toolbar">
        <Link href="/panou/administrare" className="text-button">
          ← Administrare
        </Link>
        {data && (
          <>
            <div>
              <span className="eyebrow">VERIFICARE DE CĂTRE ADMINISTRATOR</span>
              <h1>{data.property.title || "Proprietate fără titlu"}</h1>
              <p>
                Agent: {data.profile.name} · {data.profile.email}
              </p>
            </div>
            <label>
              Notă de publicare
              <input
                value={reason}
                maxLength={500}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <PublicationPackagePicker
              value={selectedPackage}
              onChange={setSelectedPackage}
              administrator
              locked={Boolean(data.packageLocked || data.grant || data.video)}
              disabled={busy}
            />
            <button
              className="button primary"
              disabled={busy || issues.length > 0 || !reason.trim()}
              onClick={() => void publish()}
            >
              {busy
                ? "Se publică…"
                : data.grant && data.property.status === "published"
                  ? "Publică din nou · Gratuit"
                  : "Publică gratuit"}
            </button>
            {data.property.status === "published" && (
              <Link
                className="button secondary"
                href={publicPath(data.property)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Vezi site-ul public ↗
              </Link>
            )}
            {data.grant && (
              <p>
                Publicare gratuită aprobată la{" "}
                {new Date(data.grant.granted_at).toLocaleDateString("ro-RO")}.{" "}
                {data.grant.reason}
              </p>
            )}
            {data.video?.provider && (
              <p>
                Furnizorul acestui film: {data.video.provider}.
                {data.video.nextProvider &&
                  ` Filmele noi folosesc ${data.video.nextProvider}.`}
              </p>
            )}
            {data.video?.canRebuild &&
              !data.video.canResume &&
              !data.video.durationRepair &&
              data.video.rebuildUsesCredits && (
                <p>
                  Refacerea generează până la{" "}
                  {Math.min(data.property.images.length, 23)} scene noi prin
                  furnizorul video selectat și folosește creditele API. Nu
                  există o nouă plată de 249 RON pentru proprietate.
                </p>
              )}
            {data.video?.costEstimate && (
              <p>
                {data.video.durationRepair
                  ? "Estimarea anterioară a generării: $"
                  : "Cost estimat al generării video: $"}
                {data.video.costEstimate.usd.toFixed(2)} USD
                {" · "}
                {data.video.costEstimate.generatedSeconds}s generate
                {" · "}
                {data.video.costEstimate.finalSeconds}s film de prezentare.{" "}
                Buget de planificare: $
                {data.video.costEstimate.limitUsd.toFixed(2)} USD. Costurile
                reale depind de tarifele furnizorului.
              </p>
            )}
            {data.video?.canResume && (
              <div>
                <p>
                  Reluarea păstrează cele {data.video.completed} scene
                  finalizate. Scenele rămase folosesc credite API. Verifică
                  motivul respingerii înainte de a continua.
                </p>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => void resumeFilm()}
                >
                  Reia filmul · Păstrează scenele salvate
                </button>
              </div>
            )}
            {data.video?.durationRepair && (
              <div>
                {data.video.durationRepair.error ? (
                  <p role="status">{data.video.durationRepair.error}</p>
                ) : (
                  <>
                    <p>
                      Seedance necesită cel puțin 4 secunde generate pe scenă.
                      Păstrează cele {data.video.completed} scene finalizate și
                      secvențele scurte din montajul final. Estimarea corectată
                      a generării totale: $
                      {data.video.durationRepair.usd.toFixed(2)} USD ·{" "}
                      {data.video.durationRepair.generatedSeconds}s generate,
                      inclusiv scenele salvate. Generarea rămasă folosește
                      credite API.
                    </p>
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() => void resumeFilm(true)}
                    >
                      Corectează durata și reia · Păstrează scenele salvate
                    </button>
                  </>
                )}
              </div>
            )}
            {data.video?.canRebuild &&
              !data.video.canResume &&
              !data.video.durationRepair && (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => void rebuildFilm()}
                >
                  {data.video.rebuildUsesCredits
                    ? "Refă filmul · Folosește credite API"
                    : "Refă filmul · Fără taxă pentru proprietate"}
                </button>
              )}
            {data.video?.error && <p role="status">{data.video.error}</p>}
            {data.video && (
              <p role="status">
                Video:{" "}
                {(
                  {
                    queued: "în coadă",
                    processing: "în pregătire",
                    completed: "finalizat",
                    failed: "eșuat",
                    cancelled: "anulat",
                  } as Record<string, string>
                )[data.video.status] || data.video.status}
                {data.video.activeScenes
                  ? ` · ${data.video.activeScenes} solicitări de generare în curs`
                  : ""}
                {data.video.total
                  ? ` · ${data.video.completed} din ${data.video.total} scene pregătite`
                  : ""}
                .
              </p>
            )}
            {issues.length > 0 && (
              <div role="status">
                <p>
                  Completează aceste detalii în contul agentului înainte de
                  publicare:
                </p>
                <ul>
                  {issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
        {!data && !error && <p role="status">Se încarcă proprietatea…</p>}
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
      </section>
      {data && (
        <PropertyWebsite
          property={data.property}
          profile={data.profile}
          preview
          previewBackLink={{
            href: "/panou/administrare",
            label: "Înapoi la administrare",
          }}
          film={data.video?.film || undefined}
          videoIncluded={
            data.packageLocked || data.grant || data.video
              ? data.videoIncluded !== false
              : publicationPackages[selectedPackage].includesVideo
          }
          videoPanel={
            data.video && data.video.status !== "completed" ? (
              <PropertyVideoProgressPanel
                status={data.video.status}
                progress={{
                  completed: data.video.completed,
                  total: data.video.total,
                }}
                needsReview={
                  Boolean(data.video.error) &&
                  data.video.status === "processing"
                }
              />
            ) : undefined
          }
        />
      )}
    </>
  );
}
