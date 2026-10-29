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
        {needsReview ? "needs attention" : working ? "processing" : status}
        {progress && progress.total > 0
          ? ` · ${progress.completed} of ${progress.total} scenes ready`
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
          ? "Your video needs a status check."
          : status === "failed"
            ? "Your video needs attention."
            : status === "queued"
              ? "Your video is queued."
              : status === "completed"
                ? "Your property film is ready."
                : "Your property, in motion."}
      </h3>
      <p>
        {needsReview || status === "failed"
          ? "Your website remains live. Please contact support if you need help finishing your video."
          : status === "completed"
            ? "Your completed film is ready to view."
            : "Your video will appear here automatically when it’s ready. You can leave this page while we finish it."}
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
          aria-label="Scenes ready"
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
          All scenes are ready. We’re finishing your film.
        </p>
      )}
      {children}
    </div>
  );
}
