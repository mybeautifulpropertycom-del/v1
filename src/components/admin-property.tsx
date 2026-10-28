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

type Detail = {
  property: Property;
  profile: Profile;
  grant: { reason: string; granted_at: string } | null;
  video: {
    status: string;
    provider?: string;
    nextProvider?: string;
    attempts: number;
    canRebuild?: boolean;
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
    "Administrator complimentary publication",
  );
  const [notice, setNotice] = useState("");
  const refresh = useCallback(async () => {
    const next = await adminRequest(`properties?id=${encodeURIComponent(id)}`);
    setData(next);
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
        <h1>Administrator access required.</h1>
        <Link href="/dashboard">Return to your workspace</Link>
      </div>
    );
  async function publish() {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await adminRequest("publish", { propertyId: id, reason });
      await refresh();
      setNotice(
        "The property is public. Its included video will appear when it is ready. No payment was collected by this action.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publication unavailable.");
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
        "Your new film is queued. The current video stays available until its replacement is ready. No new property payment is required.",
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The film could not be queued.",
      );
    } finally {
      setBusy(false);
    }
  }
  const issues = data ? publicationErrors(data.property, data.profile) : [];
  return (
    <>
      <section className="admin-property-toolbar">
        <Link href="/dashboard/admin" className="text-button">
          ← Administration
        </Link>
        {data && (
          <>
            <div>
              <span className="eyebrow">ADMINISTRATOR REVIEW</span>
              <h1>{data.property.title || "Untitled property"}</h1>
              <p>
                Agent: {data.profile.name} · {data.profile.email}
              </p>
            </div>
            <label>
              Publication note
              <input
                value={reason}
                maxLength={500}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <button
              className="button primary"
              disabled={busy || issues.length > 0 || !reason.trim()}
              onClick={() => void publish()}
            >
              {busy
                ? "Publishing…"
                : data.grant && data.property.status === "published"
                  ? "Publish again · No charge"
                  : "Publish at no charge"}
            </button>
            {data.property.status === "published" && (
              <Link
                className="button secondary"
                href={publicPath(data.property)}
                target="_blank"
                rel="noopener noreferrer"
              >
                View public website ↗
              </Link>
            )}
            {data.grant && (
              <p>
                Complimentary publication approved on{" "}
                {new Date(data.grant.granted_at).toLocaleDateString("en-US")}.{" "}
                {data.grant.reason}
              </p>
            )}
            {data.video?.provider && (
              <p>
                This video's provider: {data.video.provider}.
                {data.video.nextProvider &&
                  ` New films use ${data.video.nextProvider}.`}
              </p>
            )}
            {data.video?.canRebuild && data.video.rebuildUsesCredits && (
              <p>
                Rebuilding generates up to{" "}
                {Math.min(data.property.images.length, 23)} new scenes through
                your selected video provider and uses your API credits. There is
                no new $97 property payment.
              </p>
            )}
            {data.video?.costEstimate && (
              <p>
                Estimated video generation: $
                {data.video.costEstimate.usd.toFixed(2)} USD
                {" · "}
                {data.video.costEstimate.generatedSeconds}s generated
                {" · "}
                {data.video.costEstimate.finalSeconds}s cinematic walkthrough.{" "}
                Planning budget: ${data.video.costEstimate.limitUsd.toFixed(2)}{" "}
                USD. Actual charges depend on the provider’s pricing.
              </p>
            )}
            {data.video?.canRebuild && (
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => void rebuildFilm()}
              >
                {data.video.rebuildUsesCredits
                  ? "Rebuild video · Uses API credits"
                  : "Rebuild video · No property fee"}
              </button>
            )}
            {data.video?.error && <p role="status">{data.video.error}</p>}
            {data.video && (
              <p role="status">
                Video: {data.video.status}
                {data.video.total
                  ? ` · ${data.video.completed} of ${data.video.total} scenes ready`
                  : ""}
                .
              </p>
            )}
            {issues.length > 0 && (
              <div role="status">
                <p>
                  Complete these details in the agent’s workspace before
                  publishing:
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
        {!data && !error && <p role="status">Loading property…</p>}
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
      </section>
      {data && (
        <PropertyWebsite
          property={data.property}
          profile={data.profile}
          preview
          previewBackLink={{
            href: "/dashboard/admin",
            label: "Back to administration",
          }}
          film={data.video?.film || undefined}
        />
      )}
    </>
  );
}
