"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadStripe, type StripeEmbeddedCheckout } from "@stripe/stripe-js";
import {
  Check,
  ExternalLink,
  Film,
  Globe2,
  LockKeyhole,
  X,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { publicPath, type Property } from "@/lib/model";

type PublicationStatus = {
  enabled?: boolean;
  mode?: string;
  canPurchase?: boolean;
  paid?: boolean;
  allowed?: boolean;
  published?: boolean;
  publicPath?: string;
  publicationError?: string | null;
  videoStatus?: string | null;
  videoNeedsReview?: boolean;
  videoAttempts?: number;
  videoError?: string | null;
  videoProgress?: { completed: number; total: number } | null;
  canRetryVideo?: boolean;
  film?: { src: string; poster?: string } | null;
};
async function request(id: string, method: "GET" | "POST", retryVideo = false) {
  const { data } = await getSupabase()!.auth.getSession();
  if (!data.session) throw new Error("Please sign in again.");
  const response = await fetch(
    retryVideo
      ? "/api/video/retry"
      : `/api/billing/checkout${method === "GET" ? `?propertyId=${id}&workflow=publish` : ""}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        "Content-Type": "application/json",
      },
      ...(method === "POST"
        ? { body: JSON.stringify({ propertyId: id, embedded: true }) }
        : {}),
      signal: AbortSignal.timeout(55000),
    },
  );
  const body = await response.json();
  if (!response.ok)
    throw new Error(
      body.error || "Publication is temporarily unavailable. Please try again.",
    );
  return body;
}
function PaymentForm({
  clientSecret,
  publishableKey,
  onComplete,
  onError,
}: {
  clientSecret: string;
  publishableKey: string;
  onComplete: () => void;
  onError: (error: string) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onComplete, onError });
  callbacks.current = { onComplete, onError };
  useEffect(() => {
    let active = true;
    let checkout: StripeEmbeddedCheckout | undefined;
    void (async () => {
      try {
        const stripe = await loadStripe(publishableKey);
        if (!active) return;
        if (!stripe) throw new Error("The secure payment form could not load.");
        checkout = await stripe.createEmbeddedCheckoutPage({
          clientSecret,
          onComplete: () => callbacks.current.onComplete(),
        });
        if (!active) {
          checkout.destroy();
          return;
        }
        if (root.current) checkout.mount(root.current);
      } catch (error) {
        if (active)
          callbacks.current.onError(
            error instanceof Error
              ? error.message
              : "The secure payment form could not load.",
          );
      }
    })();
    return () => {
      active = false;
      checkout?.destroy();
    };
  }, [clientSecret, publishableKey]);
  return (
    <div
      className="publish-payment-frame"
      ref={root}
      aria-label="Secure Stripe payment form"
    />
  );
}
function Modal({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  const element = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const focus = document.activeElement as HTMLElement | null;
    const previous = document.body.style.overflow;
    element.current?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element.current?.close();
      document.body.style.overflow = previous;
      focus?.focus();
    };
  }, []);
  // Native dialog focus containment also handles Stripe's cross-origin iframe.
  return (
    <dialog
      className="publish-dialog"
      ref={element}
      aria-labelledby="publish-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <button
        className="publish-dialog-close"
        type="button"
        onClick={onClose}
        aria-label="Close publication dialog"
      >
        <X size={22} />
      </button>
      {children}
    </dialog>
  );
}
export function usePropertyPublication(options: {
  property: Property | undefined;
  demo: boolean;
  disabled: boolean;
  prepare: () => Promise<Property | null>;
  onPublished: () => Promise<void>;
  publishDemo?: () => Promise<void>;
}) {
  const current = useRef(options);
  current.current = options;
  const [open, setOpen] = useState(false),
    [status, setStatus] = useState<PublicationStatus>({}),
    [phase, setPhase] = useState<
      "loading" | "payment" | "confirming" | "success" | "demo" | "error"
    >("loading"),
    [error, setError] = useState("");
  const [payment, setPayment] = useState<{
    clientSecret: string;
    publishableKey: string;
  } | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [videoError, setVideoError] = useState("");
  const pending = useRef(false),
    generation = useRef(0),
    reported = useRef(false);
  const id = options.property?.id;
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const refresh = useCallback(async () => {
    if (!id || current.current.demo) return;
    const result: PublicationStatus = await request(id, "GET");
    setStatus(result);
    if (
      result.published &&
      current.current.property?.status !== "published" &&
      !reported.current
    ) {
      reported.current = true;
      try {
        await current.current.onPublished();
      } catch (e) {
        reported.current = false;
        throw e;
      }
    }
    if (result.publicationError) throw new Error(result.publicationError);
    return result;
  }, [id]);
  useEffect(() => {
    reported.current = options.property?.status === "published";
  }, [options.property?.status, id]);
  useEffect(() => {
    if (!options.demo && id) void refresh().catch(() => {});
  }, [id, options.demo, refresh]);
  useEffect(() => {
    if (!open || phase !== "confirming") return;
    let active = true,
      timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    async function poll() {
      try {
        const result = await refresh();
        if (!active) return;
        if (result?.published) {
          setPhase("success");
          return;
        }
        if (result?.mode !== "live" && result?.paid) {
          setError(
            "Test payment confirmed. Your property remains a private draft.",
          );
          setPhase("error");
          return;
        }
        if (attempts++ < 30) timer = setTimeout(poll, 2000);
        else {
          setError(
            "Your payment is still being confirmed. Your draft is saved. Check the status shortly; you do not need to pay again.",
          );
          setPhase("error");
        }
      } catch (e) {
        if (active) {
          setError(
            e instanceof Error ? e.message : "Confirmation is unavailable.",
          );
          setPhase("error");
        }
      }
    }
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [open, phase, refresh]);
  useEffect(() => {
    if (
      !id ||
      options.demo ||
      !["queued", "processing", "failed"].includes(status.videoStatus || "")
    )
      return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible")
        void refresh().catch(() => {});
    }, 15000);
    return () => clearInterval(timer);
  }, [id, options.demo, status.videoStatus, refresh]);
  const publish = useCallback(async () => {
    if (pending.current || current.current.disabled) return;
    pending.current = true;
    const attempt = ++generation.current;
    setOpen(true);
    setPhase("loading");
    setError("");
    setPayment(null);
    try {
      const property = await current.current.prepare();
      if (!property)
        throw new Error(
          "Review the property details and save your changes, then try again.",
        );
      if (attempt !== generation.current) return;
      if (current.current.demo) {
        setPhase("demo");
        return;
      }
      const result = await request(property.id, "POST");
      if (attempt !== generation.current) return;
      if (result.publicationError) throw new Error(result.publicationError);
      if (result.published) {
        await current.current.onPublished();
        reported.current = true;
        setStatus((s) => ({
          ...s,
          published: true,
          publicPath: publicPath(property),
        }));
        setPhase("success");
      } else if (result.processing) {
        setPhase("confirming");
      } else if (result.testPaid) {
        setError(
          "Test payment confirmed. Your property remains a private draft.",
        );
        setPhase("error");
      } else if (result.clientSecret && result.publishableKey) {
        setStatus((s) => ({ ...s, mode: result.mode }));
        setPayment(result);
        setPhase("payment");
      } else throw new Error("The secure payment form could not be opened.");
    } catch (e) {
      if (attempt === generation.current) {
        setError(
          e instanceof Error ? e.message : "Publication is unavailable.",
        );
        setPhase("error");
      }
    } finally {
      pending.current = false;
    }
  }, []);
  const close = () => {
    generation.current++;
    setOpen(false);
    setPayment(null);
  };
  const videoPanel = (
    <div className="property-video-prompt">
      <Film size={30} strokeWidth={1.3} />
      <h3>
        {status.videoNeedsReview
          ? "Your video needs a status check."
          : status.videoStatus === "processing"
            ? "Your property, coming to life."
            : status.videoStatus === "queued"
              ? "Your video is queued."
              : status.videoStatus === "failed"
                ? "Your video needs another moment."
                : "Bring your property to life."}
      </h3>
      <p>
        {status.videoNeedsReview
          ? "Your website remains live. We are checking the generation confirmation. Please contact support; another video will not be charged automatically."
          : status.videoStatus === "queued"
            ? "Your website is live. Your included video is awaiting generation and will appear here when it is ready."
            : status.videoStatus === "processing"
              ? "We’re creating your presentation video. It will appear here and on your property website when it’s ready."
              : status.videoStatus === "failed"
                ? (status.videoAttempts ?? 0) >= 3
                  ? "Your website remains live. Please contact support to finish your included video; no new property payment is needed."
                  : "Your website remains live. You can retry your video after a short pause, without another payment."
                : options.property?.status === "published"
                  ? "Your completed presentation video will appear here when it is available."
                  : "Publish your property to generate a presentation video from your photos. Your video will appear here and on your property website when it’s ready."}
      </p>
      {status.videoStatus === "processing" && status.videoProgress && (
        <p role="status">
          {status.videoProgress.completed < status.videoProgress.total
            ? `${status.videoProgress.completed} of ${status.videoProgress.total} scenes ready. You can leave this page; your video will keep processing.`
            : "Your scenes are ready. We’re adding the music and finishing your film."}
        </p>
      )}
      {status.videoStatus === "failed" && status.canRetryVideo !== false && (
        <button
          type="button"
          className="button secondary"
          disabled={retrying}
          onClick={async () => {
            if (!id || retrying) return;
            setRetrying(true);
            setVideoError("");
            try {
              await request(id, "POST", true);
              setStatus((s) => ({ ...s, videoStatus: "queued" }));
            } catch (e) {
              setVideoError(
                e instanceof Error ? e.message : "Please try again.",
              );
            } finally {
              setRetrying(false);
            }
          }}
        >
          {retrying ? "Queuing your video…" : "Retry video · No extra charge"}
        </button>
      )}
      {videoError && <p role="alert">{videoError}</p>}
      {options.property?.status !== "published" && (
        <button
          type="button"
          className="button primary"
          disabled={options.disabled}
          onClick={() => void publish()}
        >
          <Globe2 size={16} />
          Publish Property
        </button>
      )}
    </div>
  );
  const dialog = open ? (
    <Modal onClose={close}>
      <div className="publish-dialog-heading">
        <span className="eyebrow">
          {status.mode === "test"
            ? "STRIPE TEST MODE"
            : "A BEAUTIFUL FIRST IMPRESSION"}
        </span>
        <h2 id="publish-dialog-title">
          {phase === "success"
            ? "Your property is live."
            : "Ready for its next chapter."}
        </h2>
        <p>{options.property?.title || "Your property website"}</p>
      </div>
      {phase !== "success" && (
        <div className="publish-offer">
          <div>
            <strong>
              $97 <small>USD</small>
            </strong>
            <span>One-time payment · No subscription</span>
          </div>
          <ul>
            <li>
              <Check size={16} />
              Your published property website
            </li>
            <li>
              <Check size={16} />
              One presentation video from your photos
            </li>
            <li>
              <Check size={16} />
              Ongoing edits to this property website
            </li>
          </ul>
          <p>
            Your website publishes after payment is confirmed. Your video will
            be added when it’s ready.
          </p>
        </div>
      )}
      {phase === "loading" && (
        <p className="publish-status" role="status">
          Saving your website and preparing secure checkout…
        </p>
      )}
      {phase === "payment" && payment && (
        <>
          <PaymentForm
            {...payment}
            onComplete={() => {
              setPayment(null);
              setPhase("confirming");
            }}
            onError={(message) => {
              setError(message);
              setPhase("error");
            }}
          />
          <p className="publish-secure">
            <LockKeyhole size={14} />
            Secure payment powered by Stripe
          </p>
        </>
      )}
      {phase === "confirming" && (
        <p className="publish-status" role="status">
          Confirming your payment and publishing your property…
        </p>
      )}
      {phase === "error" && (
        <div className="publish-error">
          <p role="alert">{error}</p>
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              setError("");
              setPhase("confirming");
            }}
          >
            Check payment status
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => void publish()}
          >
            Try again
          </button>
        </div>
      )}
      {phase === "demo" && (
        <div className="publish-status">
          <p>This is a browser demo. No payment or video will be generated.</p>
          <button
            className="button primary"
            onClick={async () => {
              try {
                await current.current.publishDemo?.();
                setPhase("success");
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Publication failed.",
                );
                setPhase("error");
              }
            }}
          >
            Publish in demo
          </button>
        </div>
      )}
      {phase === "success" && (
        <div className="publish-success">
          <Check size={32} />
          <p role="status">Your property website is published.</p>
          <p>
            {status.videoStatus
              ? "Your included video will appear on the website when it is ready."
              : "Your website is ready to share."}
          </p>
          {!options.demo && (
            <a
              className="button primary"
              href={status.publicPath || publicPath(options.property!)}
              target="_blank"
              rel="noopener noreferrer"
            >
              View live website <ExternalLink size={16} />
            </a>
          )}
          <button type="button" className="button secondary" onClick={close}>
            Back to editing
          </button>
        </div>
      )}
    </Modal>
  ) : null;
  return { publish, dialog, videoPanel, film: status.film ?? undefined };
}
