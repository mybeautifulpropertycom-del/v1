"use client";
import { useEffect, useRef, useState } from "react";
import {
  loadStripe,
  type StripePaymentElement,
  type StripeCheckoutLoadActionsSuccess,
  type StripeCheckoutAddress,
} from "@stripe/stripe-js";

export type BillingDetails = { name: string; email: string; phone: string };

export function StripePaymentForm({
  clientSecret,
  publishableKey,
  billingDetails,
  onComplete,
  onError,
  amount,
  onBusyChange,
  returnUrl,
}: {
  clientSecret: string;
  publishableKey: string;
  billingDetails: BillingDetails;
  onComplete: () => void;
  onError: (error: string) => void;
  amount: number;
  onBusyChange?: (busy: boolean) => void;
  returnUrl?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const actions = useRef<StripeCheckoutLoadActionsSuccess | null>(null);
  const cardAddress = useRef<StripeCheckoutAddress | null>(null);
  const submitting = useRef(false);
  const mounted = useRef(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const callbacks = useRef({ onComplete, onError, onBusyChange });
  callbacks.current = { onComplete, onError, onBusyChange };
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
        callbacks.current.onBusyChange?.(true);
        setError("");
        try {
          // Preserve Stripe-collected billing details when needed; the profile
          // contains contact information, not the cardholder's billing address.
          const address =
            actions.current.getSession().billingAddress?.address ||
            cardAddress.current;
          const result = await actions.current.confirm({
            redirect: "if_required",
            returnUrl: new URL(
              returnUrl || window.location.href,
              window.location.origin,
            ).href,
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
          if (mounted.current) {
            setBusy(false);
            callbacks.current.onBusyChange?.(false);
          }
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
