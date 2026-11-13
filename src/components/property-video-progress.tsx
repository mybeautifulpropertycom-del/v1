import { Check, Film, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

type VideoProgressProps = {
  status?: string | null;
  progress?: { completed: number; total: number } | null;
  needsReview?: boolean;
};

export function PropertyVideoStatus({
  status,
  progress,
  needsReview,
}: VideoProgressProps) {
  if (!status) return null;
  const working = !needsReview && ["queued", "processing"].includes(status);
  return (
    <div className="property-video-status" role="status" aria-live="polite">
      {working ? (
        <LoaderCircle
          className="property-video-spinner"
          size={16}
          aria-hidden="true"
        />
      ) : status === "completed" ? (
        <Check size={16} aria-hidden="true" />
      ) : (
        <Film size={16} aria-hidden="true" />
      )}
      <span>
        Video:{" "}
        {needsReview
          ? "necesită verificare"
          : working
            ? "în pregătire"
            : (
                {
                  completed: "finalizat",
                  failed: "eșuat",
                  cancelled: "anulat",
                  queued: "în coadă",
                  processing: "în pregătire",
                  not_ordered: "necomandat",
                  delivered: "livrat",
                  pending: "în așteptare",
                } as Record<string, string>
              )[status] || status}
        {progress && progress.total > 0
          ? ` · ${progress.completed} din ${progress.total} scene pregătite`
          : ""}
      </span>
    </div>
  );
}

export function PropertyVideoProgressPanel({
  status,
  progress,
  needsReview,
  children,
}: VideoProgressProps & { children?: ReactNode }) {
  const working =
    !needsReview && ["queued", "processing"].includes(status || "");
  const finishing =
    working &&
    progress &&
    progress.total > 0 &&
    progress.completed >= progress.total;
  return (
    <div className="property-video-prompt">
      <div
        className={`property-video-emblem${working ? " is-working" : ""}`}
        aria-hidden="true"
      >
        <Film size={26} strokeWidth={1.3} />
      </div>
      <h3>
        {needsReview
          ? "Starea filmului necesită o verificare."
          : status === "failed"
            ? "Filmul necesită verificare."
            : status === "queued"
              ? "Filmul este în coadă."
              : status === "completed"
                ? "Filmul proprietății este gata."
                : "Proprietatea ta prinde viață."}
      </h3>
      <p>
        {needsReview || status === "failed"
          ? "Site-ul rămâne publicat. Contactează asistența dacă ai nevoie de ajutor pentru finalizarea filmului."
          : status === "completed"
            ? "Filmul finalizat poate fi vizionat."
            : "Filmul va apărea automat aici când este gata. Poți părăsi pagina în timp ce îl finalizăm."}
      </p>
      <PropertyVideoStatus
        status={status}
        progress={progress}
        needsReview={needsReview}
      />
      {working && progress && progress.total > 0 && (
        <div
          className="property-video-progress-track"
          role="progressbar"
          aria-label="Scene pregătite"
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={Math.min(progress.completed, progress.total)}
        >
          <span
            style={{
              width: `${Math.min(100, Math.max(0, (progress.completed / progress.total) * 100))}%`,
            }}
          />
        </div>
      )}
      {finishing && (
        <p className="property-video-finishing">
          Toate scenele sunt pregătite. Finalizăm filmul.
        </p>
      )}
      {children}
    </div>
  );
}
