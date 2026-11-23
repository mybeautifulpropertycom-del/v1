"use client";
import { useEffect, useRef, useState } from "react";
import { LockKeyhole, X } from "lucide-react";
import { StripePaymentForm, type BillingDetails } from "./stripe-payment-form";
import { promotionRequest } from "@/lib/promotion-client";
import type { PromotionOrder } from "@/lib/promotion-packages";

export type PromotionPayment = {
  orderId: string;
  clientSecret?: string;
  publishableKey?: string;
  billingDetails?: BillingDetails;
  amount?: number;
  processing?: boolean;
};

export function PromotionDialog({
  children,
  onClose,
  busy = false,
}: {
  children: React.ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = overflow;
      previous?.focus({ preventScroll: true });
    };
  }, []);
  // Native focus containment includes Stripe's cross-origin card iframe.
  return (
    <dialog
      ref={dialog}
      className="promotion-dialog"
      aria-labelledby="promotion-purchase-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <button
        type="button"
        className="promotion-dialog-close"
        aria-label="Închide alegerea promovării"
        disabled={busy}
        onClick={onClose}
      >
        <X size={20} />
      </button>
      {children}
    </dialog>
  );
}

export function PromotionPaymentPanel({
  payment,
  onUpdated,
  onBusyChange,
}: {
  payment: PromotionPayment;
  onUpdated: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [confirming, setConfirming] = useState(Boolean(payment.processing));
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const updated = useRef(onUpdated);
  updated.current = onUpdated;
  useEffect(() => {
    if (!confirming) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();
    async function verify(first: boolean) {
      try {
        // Confirmation in the browser alone never marks an order as paid.
        // Resume verifies the completed Stripe session on our server; webhooks
        // remain authoritative even if the agent closes this dialog.
        if (first)
          await promotionRequest({
            action: "resume",
            orderId: payment.orderId,
          });
        const result = await promotionRequest();
        if (!active) return;
        const order = (result.orders as PromotionOrder[]).find(
          (item) => item.id === payment.orderId,
        );
        if (order?.payment_status === "paid") {
          setConfirmed(true);
          updated.current();
          return;
        }
        if (
          order &&
          ["refunded", "disputed", "cancelled"].includes(order.payment_status)
        ) {
          setError("Verifică starea plății în lista promovărilor tale.");
          updated.current();
          return;
        }
      } catch {
        // Never offer a second payment because verification was delayed.
      }
      if (!active) return;
      if (Date.now() - started < 60000)
        timer = setTimeout(() => void verify(false), 3000);
      else {
        setError(
          "Confirmarea întârzie. Poți închide fereastra și verifica starea în Promovările tale.",
        );
        updated.current();
      }
    }
    void verify(true);
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [confirming, payment.orderId]);
  if (confirmed)
    return (
      <div className="promotion-payment-result" role="status">
        <h3>Plată confirmată</h3>
        <p>
          Am primit comanda. Te contactăm pentru detaliile campaniei înainte de
          lansare.
        </p>
      </div>
    );
  return (
    <div className="promotion-payment">
      {confirming ? (
        <p role="status">
          Verificăm confirmarea plății. Comanda se actualizează automat.
        </p>
      ) : (
        <>
          <p className="promotion-payment-security">
            <LockKeyhole size={16} /> Plată securizată prin Stripe
          </p>
          {payment.billingDetails && (
            <div className="promotion-payment-contact">
              <strong>{payment.billingDetails.name}</strong>
              <span>{payment.billingDetails.email}</span>
              {payment.billingDetails.phone && (
                <span>{payment.billingDetails.phone}</span>
              )}
            </div>
          )}
          {payment.clientSecret &&
            payment.publishableKey &&
            payment.billingDetails &&
            payment.amount && (
              <StripePaymentForm
                clientSecret={payment.clientSecret}
                publishableKey={payment.publishableKey}
                billingDetails={payment.billingDetails}
                amount={payment.amount}
                returnUrl={`/panou/promovare?payment=success&order=${payment.orderId}`}
                onBusyChange={onBusyChange}
                onError={setError}
                onComplete={() => {
                  setError("");
                  setConfirming(true);
                }}
              />
            )}
          <p className="promotion-purchase-note">
            Întreaga sumă este buget Google Ads. Configurarea și administrarea
            sunt incluse.
          </p>
        </>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
