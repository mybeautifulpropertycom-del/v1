"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadStripe,
  type StripePaymentElement,
  type StripeCheckoutLoadActionsSuccess,
  type StripeCheckoutAddress,
} from "@stripe/stripe-js";
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
import { useWorkspace } from "./workspace-provider";
import { adminRequest } from "@/lib/admin-client";
import {
  isPublicationPackage,
  publicationPackages,
  type PublicationPackage,
} from "@/lib/publication-packages";
import { PublicationPackagePicker } from "./publication-package-picker";
import {
  PropertyVideoProgressPanel,
  PropertyVideoStatus,
} from "./property-video-progress";

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
  package?: PublicationPackage | null;
  videoIncluded?: boolean;
};
async function request(
  id: string,
  method: "GET" | "POST",
  retryVideo = false,
  selected: PublicationPackage = "video",
) {
  const { data } = await getSupabase()!.auth.getSession();
  if (!data.session) throw new Error("Autentifică-te din nou.");
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
        ? {
            body: JSON.stringify({
              propertyId: id,
              embedded: true,
              package: selected,
            }),
          }
        : {}),
      signal: AbortSignal.timeout(55000),
    },
  );
  const body = await response.json();
  if (!response.ok)
    throw new Error(
      body.error || "Publicarea este temporar indisponibilă. Încearcă din nou.",
    );
  return body;
}
type BillingDetails = { name: string; email: string; phone: string };

function PaymentForm({
  clientSecret,
  publishableKey,
  billingDetails,
  onComplete,
  onError,
  amount,
}: {
  clientSecret: string;
  publishableKey: string;
  billingDetails: BillingDetails;
  onComplete: () => void;
  onError: (error: string) => void;
  amount: number;
}) {
  const root = useRef<HTMLDivElement>(null);
  const actions = useRef<StripeCheckoutLoadActionsSuccess | null>(null);
  const cardAddress = useRef<StripeCheckoutAddress | null>(null);
  const submitting = useRef(false);
  const mounted = useRef(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const callbacks = useRef({ onComplete, onError });
  callbacks.current = { onComplete, onError };
  useEffect(() => {
    let active = true;
    mounted.current = true;
    let element: StripePaymentElement | undefined;
    void (async () => {
      try {
        const stripe = await loadStripe(publishableKey);
        if (!active) return;
        if (!stripe)
          throw new Error(
            "Formularul securizat de plată nu a putut fi încărcat.",
          );
        const checkout = stripe.initCheckoutElementsSdk({
          clientSecret,
          elementsOptions: {
            savedPaymentMethod: {
              enableSave: "never",
              enableRedisplay: "never",
            },
            appearance: {
              theme: "stripe",
              variables: { colorPrimary: "#25382e", borderRadius: "8px" },
            },
          },
        });
        const result = await checkout.loadActions();
        if (!active) return;
        if (result.type === "error") throw new Error(result.error.message);
        actions.current = result.actions;
        element = checkout.createPaymentElement({
          fields: {
            billingDetails: {
              name: "never",
              email: "never",
              phone: "never",
              address: "if_required",
            },
          },
          wallets: { applePay: "never", googlePay: "never", link: "never" },
        });
        // Contact details belong to the server-created Customer. Do not update
        // email/phone through Checkout: its collection settings prohibit that.
        element.update({
          defaultValues: {
            billingDetails: {
              name: billingDetails.name,
            },
          },
        });
        element.on("change", (event) => {
          const address = event.value.billingDetails?.address;
          cardAddress.current = address?.country
            ? { country: address.country, postal_code: address.postalCode }
            : null;
        });
        element.on("ready", () => {
          if (active) setReady(true);
        });
        element.on("loaderror", () => {
          if (active)
            callbacks.current.onError(
              "Formularul securizat de plată nu a putut fi încărcat. Încearcă din nou.",
            );
        });
        if (root.current) element.mount(root.current);
      } catch (error) {
        if (active)
          callbacks.current.onError(
            error instanceof Error
              ? error.message
              : "Formularul securizat de plată nu a putut fi încărcat.",
          );
      }
    })();
    return () => {
      active = false;
      mounted.current = false;
      actions.current = null;
      element?.destroy();
    };
  }, [clientSecret, publishableKey, billingDetails]);
  return (
    <form
      className="publish-payment-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!ready || !actions.current || submitting.current) return;
        submitting.current = true;
        setBusy(true);
        setError("");
        try {
          // Preserve Stripe-collected billing details when needed; the profile
          // contains contact information, not the cardholder's billing address.
          const address =
            actions.current.getSession().billingAddress?.address ||
            cardAddress.current;
          const result = await actions.current.confirm({
            redirect: "if_required",
            returnUrl: window.location.href,
            savePaymentMethod: false,
            ...(address?.country
              ? { billingAddress: { name: billingDetails.name, address } }
              : {}),
          });
          if (!mounted.current) return;
          if (result.type === "error") setError(result.error.message);
          else callbacks.current.onComplete();
        } catch {
          if (mounted.current)
            setError(
              "Plata nu a putut fi confirmată. Verifică datele cardului și încearcă din nou.",
            );
        } finally {
          submitting.current = false;
          if (mounted.current) setBusy(false);
        }
      }}
    >
      <div
        className="publish-payment-frame"
        ref={root}
        aria-label="Formular securizat de plată Stripe"
      />
      {!ready && <p role="status">Se încarcă formularul de card…</p>}
      {error && (
        <p className="publish-card-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="button primary publish-pay-button"
        type="submit"
        disabled={!ready || busy}
      >
        {busy ? "Se procesează plata…" : `Plătește ${amount / 100} RON`}
      </button>
    </form>
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
        aria-label="Închide fereastra de publicare"
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
  const { isAdmin } = useWorkspace();
  const administrator = useRef(isAdmin);
  administrator.current = isAdmin;
  const current = useRef(options);
  current.current = options;
  const [open, setOpen] = useState(false),
    [status, setStatus] = useState<PublicationStatus>({}),
    [phase, setPhase] = useState<
      | "loading"
      | "choose"
      | "payment"
      | "confirming"
      | "success"
      | "demo"
      | "error"
    >("loading"),
    [error, setError] = useState("");
  const [payment, setPayment] = useState<{
    clientSecret: string;
    publishableKey: string;
    billingDetails: BillingDetails;
    amount: number;
  } | null>(null);
  const [selectedPackage, setSelectedPackage] =
    useState<PublicationPackage>("photos");
  const [packageLocked, setPackageLocked] = useState(false);
  const preparedProperty = useRef<Property | null>(null);
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
            "Plata de test a fost confirmată. Proprietatea rămâne o ciornă privată.",
          );
          setPhase("error");
          return;
        }
        if (attempts++ < 30) timer = setTimeout(poll, 2000);
        else {
          setError(
            "Plata este în curs de confirmare. Ciorna este salvată. Verifică starea în câteva momente; nu trebuie să plătești din nou.",
          );
          setPhase("error");
        }
      } catch (e) {
        if (active) {
          setError(
            e instanceof Error ? e.message : "Confirmarea este indisponibilă.",
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
  const publish = useCallback(async (selected?: PublicationPackage) => {
    if (pending.current || current.current.disabled) return;
    pending.current = true;
    const attempt = ++generation.current;
    setOpen(true);
    setPhase("loading");
    setError("");
    setPayment(null);
    try {
      if (!selected) preparedProperty.current = null;
      const property =
        preparedProperty.current || (await current.current.prepare());
      if (!property)
        throw new Error(
          "Verifică detaliile proprietății și salvează modificările, apoi încearcă din nou.",
        );
      if (attempt !== generation.current) return;
      preparedProperty.current = property;
      if (current.current.demo) {
        setPhase("demo");
        return;
      }
      if (!selected) {
        let latest: PublicationStatus;
        if (administrator.current) {
          const details = await adminRequest(
            `properties?id=${encodeURIComponent(property.id)}`,
          );
          const locked = Boolean(
            details.packageLocked || details.grant || details.video,
          );
          setPackageLocked(locked);
          latest = {
            allowed: locked,
            published: details.property?.status === "published",
            videoIncluded: details.videoIncluded ?? true,
            package: locked
              ? details.videoIncluded === false
                ? "photos"
                : "video"
              : null,
          };
        } else {
          latest = await request(property.id, "GET");
          setPackageLocked(Boolean(latest.allowed));
        }
        if (attempt !== generation.current) return;
        setStatus(latest);
        setSelectedPackage(
          isPublicationPackage(latest.package) ? latest.package : "photos",
        );
        setPhase("choose");
        return;
      }
      const offer = publicationPackages[selected];
      const result = administrator.current
        ? await adminRequest("publish", {
            propertyId: property.id,
            reason:
              "Publicare de către administrator din editorul proprietății",
            package: selected,
          })
        : await request(property.id, "POST", false, selected);
      if (attempt !== generation.current) return;
      if (result.publicationError) throw new Error(result.publicationError);
      if (result.published) {
        await current.current.onPublished();
        reported.current = true;
        setStatus((s) => ({
          ...s,
          published: true,
          videoIncluded: result.videoIncluded ?? offer.includesVideo,
          publicPath: publicPath(property),
          ...(administrator.current
            ? {
                allowed: true,
                paid: result.paid === true,
                videoStatus:
                  (result.videoIncluded ?? offer.includesVideo)
                    ? s.videoStatus || "queued"
                    : null,
              }
            : {}),
        }));
        setPhase("success");
      } else if (result.processing) {
        setPhase("confirming");
      } else if (result.testPaid) {
        setError(
          "Plata de test a fost confirmată. Proprietatea rămâne o ciornă privată.",
        );
        setPhase("error");
      } else if (result.clientSecret && result.publishableKey) {
        if (
          (result.package && result.package !== selected) ||
          (result.amount && result.amount !== offer.amount)
        )
          throw new Error(
            "Varianta de plată s-a schimbat. Verifică alegerea înainte de a continua.",
          );
        setStatus((s) => ({
          ...s,
          mode: result.mode,
          videoIncluded: offer.includesVideo,
          package: selected,
        }));
        setPayment({ ...result, amount: result.amount ?? offer.amount });
        setPhase("payment");
      } else
        throw new Error("Formularul securizat de plată nu a putut fi deschis.");
    } catch (e) {
      if (attempt === generation.current) {
        setError(
          e instanceof Error ? e.message : "Publicarea nu este disponibilă.",
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
  const videoStatus = (
    <PropertyVideoStatus
      status={status.videoStatus}
      progress={status.videoProgress}
      needsReview={status.videoNeedsReview}
    />
  );
  const videoPanel =
    status.videoStatus === "completed" &&
    status.film?.src ? null : status.videoStatus ? (
      <PropertyVideoProgressPanel
        status={status.videoStatus}
        progress={status.videoProgress}
        needsReview={status.videoNeedsReview}
      >
        {status.videoStatus === "failed" &&
          !status.videoNeedsReview &&
          status.canRetryVideo !== false && (
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
                    e instanceof Error ? e.message : "Încearcă din nou.",
                  );
                } finally {
                  setRetrying(false);
                }
              }}
            >
              {retrying
                ? "Filmul este adăugat în coadă…"
                : "Reîncearcă filmul · Fără cost suplimentar"}
            </button>
          )}
        {videoError && <p role="alert">{videoError}</p>}
      </PropertyVideoProgressPanel>
    ) : (
      <div className="property-video-prompt">
        <Film size={30} strokeWidth={1.3} />
        <h3>Dă viață proprietății tale.</h3>
        <p>
          {options.property?.status === "published"
            ? "Filmul va apărea automat aici când este gata."
            : "Publică proprietatea pentru a genera un film de prezentare din fotografiile tale. Filmul va apărea automat aici când este gata."}
        </p>
        {options.property?.status !== "published" && (
          <button
            type="button"
            className="button primary"
            disabled={options.disabled}
            onClick={() => void publish()}
          >
            <Globe2 size={16} />
            Publică proprietatea
          </button>
        )}
      </div>
    );
  const dialog = open ? (
    <Modal onClose={close}>
      <div className="publish-dialog-heading">
        <span className="eyebrow">
          {status.mode === "test"
            ? "MOD DE TEST STRIPE"
            : "O PRIMĂ IMPRESIE MEMORABILĂ"}
        </span>
        <h2
          id="publish-dialog-title"
          className={
            phase === "choose" ? "publication-choice-heading" : undefined
          }
        >
          {phase === "success"
            ? "Proprietatea este publicată."
            : phase === "choose"
              ? "Cum vrei să prezinți proprietatea?"
              : phase === "payment"
                ? "Plată securizată"
                : "Pregătită pentru următorul capitol."}
        </h2>
        <p>{options.property?.title || "Site-ul proprietății tale"}</p>
      </div>
      {phase === "choose" && (
        <>
          <PublicationPackagePicker
            value={selectedPackage}
            onChange={setSelectedPackage}
            administrator={isAdmin}
            locked={packageLocked}
          />
          <button
            type="button"
            className="button primary publish-choice-continue"
            onClick={() => void publish(selectedPackage)}
          >
            {isAdmin || status.allowed
              ? "Publică proprietatea · Gratuit"
              : `Continuă la plată · ${publicationPackages[selectedPackage].price} RON`}
          </button>
        </>
      )}
      {phase === "error" && (
        <div className="publish-offer">
          <div>
            <strong>
              {isAdmin || status.allowed ? (
                "Inclus"
              ) : (
                <>
                  {publicationPackages[selectedPackage].price}{" "}
                  <small>RON</small>
                </>
              )}
            </strong>
            <span>
              {isAdmin
                ? "Publicare de către administrator · Gratuit"
                : status.allowed
                  ? "Fără o plată suplimentară pentru publicare"
                  : "Plată unică · Fără abonament"}
            </span>
          </div>
          <ul>
            <li>
              <Check size={16} />
              Site-ul publicat al proprietății
            </li>
            {publicationPackages[selectedPackage].includesVideo && (
              <li>
                <Check size={16} />
                Un film de prezentare din fotografiile tale
              </li>
            )}
            <li>
              <Check size={16} />
              Posibilitatea de a edita în continuare site-ul proprietății
            </li>
          </ul>
          <p>
            {!publicationPackages[selectedPackage].includesVideo
              ? "Se publică prezentarea fără generare video."
              : isAdmin || status.allowed
                ? "Site-ul va fi publicat gratuit. Filmul inclus va fi adăugat când este gata."
                : "Site-ul se publică după confirmarea plății. Filmul va fi adăugat când este gata."}
          </p>
        </div>
      )}
      {phase === "loading" && (
        <p className="publish-status" role="status">
          {isAdmin
            ? "Se salvează și se publică gratuit proprietatea…"
            : "Se salvează site-ul și se pregătește publicarea…"}
        </p>
      )}
      {phase === "payment" && payment && (
        <>
          <p className="publish-selected-package">
            {publicationPackages[selectedPackage].name} · {payment.amount / 100}{" "}
            RON
          </p>
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
          <button
            type="button"
            className="text-button publish-change-package"
            onClick={() => {
              setPayment(null);
              setPhase("choose");
            }}
          >
            Schimbă varianta de publicare
          </button>
          <p className="publish-secure">
            <LockKeyhole size={14} />
            Plată securizată prin Stripe
          </p>
        </>
      )}
      {phase === "confirming" && (
        <p className="publish-status" role="status">
          Se confirmă plata și se publică proprietatea…
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
            Verifică starea plății
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => void publish(selectedPackage)}
          >
            Încearcă din nou
          </button>
        </div>
      )}
      {phase === "demo" && (
        <div className="publish-status">
          <p>
            Aceasta este o demonstrație în browser. Nu se efectuează plăți și nu
            se generează filme.
          </p>
          <button
            className="button primary"
            onClick={async () => {
              try {
                await current.current.publishDemo?.();
                setPhase("success");
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Publicarea a eșuat.",
                );
                setPhase("error");
              }
            }}
          >
            Publică în demo
          </button>
        </div>
      )}
      {phase === "success" && (
        <div className="publish-success">
          <Check size={32} />
          <p role="status">Site-ul proprietății a fost publicat.</p>
          <p>
            {status.videoIncluded !== false && status.videoStatus
              ? "Filmul inclus va apărea pe site când este gata."
              : "Site-ul este pregătit pentru distribuire."}
          </p>
          {!options.demo && (
            <a
              className="button primary"
              href={status.publicPath || publicPath(options.property!)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Vezi site-ul publicat <ExternalLink size={16} />
            </a>
          )}
          <button type="button" className="button secondary" onClick={close}>
            Înapoi la editare
          </button>
        </div>
      )}
    </Modal>
  ) : null;
  return {
    publish,
    dialog,
    videoPanel: status.videoIncluded === false ? null : videoPanel,
    videoStatus: status.videoIncluded === false ? null : videoStatus,
    videoIncluded: status.videoIncluded !== false,
    film:
      status.videoIncluded === false ? undefined : (status.film ?? undefined),
  };
}
