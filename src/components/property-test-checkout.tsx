"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CreditCard, CheckCircle2 } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import type { Property } from "@/lib/model";

async function checkoutRequest(propertyId: string, method: "GET" | "POST") {
  const { data } = await getSupabase()!.auth.getSession();
  if (!data.session) throw new Error("Please sign in again to continue.");
  const response = await fetch(
    `/api/billing/checkout${method === "GET" ? `?propertyId=${propertyId}` : ""}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        "Content-Type": "application/json",
      },
      ...(method === "POST" ? { body: JSON.stringify({ propertyId }) } : {}),
      signal: AbortSignal.timeout(55000),
    },
  );
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      result.error || "Test checkout is unavailable. Please try again.",
    );
  return result;
}

export function PropertyTestCheckout({
  propertyId,
  prepare,
  disabled,
}: {
  propertyId: string;
  prepare: () => Promise<Property | null>;
  disabled: boolean;
}) {
  const [enabled, setEnabled] = useState(false);
  const [paid, setPaid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const pending = useRef(false);
  const refresh = useCallback(async () => {
    const status = await checkoutRequest(propertyId, "GET");
    setEnabled(Boolean(status.enabled));
    setPaid(Boolean(status.paid));
    return Boolean(status.paid);
  }, [propertyId]);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    const result = new URLSearchParams(window.location.search).get("checkout");
    if (result === "cancelled")
      setMessage(
        "Checkout was cancelled. You can try again when you’re ready.",
      );
    if (result === "success")
      setMessage("Checking your test payment confirmation…");
    async function check() {
      try {
        const status = await checkoutRequest(propertyId, "GET");
        if (!active) return;
        setEnabled(Boolean(status.enabled));
        setPaid(Boolean(status.paid));
        if (status.paid) setMessage("");
        else if (result === "success" && attempts++ < 15)
          timer = setTimeout(check, 2000);
        else if (result === "success")
          setMessage(
            "Confirmation is still pending. Use Check payment status in a moment; you don’t need to pay again.",
          );
      } catch (e) {
        if (active)
          setError(
            e instanceof Error ? e.message : "Test checkout is unavailable.",
          );
      }
    }
    void check();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [propertyId]);

  async function start() {
    if (pending.current || disabled) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const property = await prepare();
      if (!property) return;
      const result = await checkoutRequest(property.id, "POST");
      if (result.paid) {
        setPaid(true);
        return;
      }
      if (result.processing) {
        setMessage(
          "Your test payment is processing. Check payment status shortly.",
        );
        return;
      }
      const url = new URL(result.url);
      if (url.origin !== "https://checkout.stripe.com")
        throw new Error("The checkout address is invalid.");
      window.location.assign(url.href);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Test checkout could not be opened.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  if (!enabled && !error) return null;
  return (
    <section
      className="property-checkout-card"
      aria-label="Property package test checkout"
    >
      <div>
        <span className="eyebrow">STRIPE TEST MODE</span>
        <h3>One property. A complete presentation.</h3>
        <p>Your property website and presentation video, together.</p>
      </div>
      <div className="property-checkout-price">
        <strong>
          $97 <small>USD</small>
        </strong>
        <span>One-time payment per property</span>
      </div>
      <p className="property-checkout-note">
        Test checkout only. No real money is collected. Video generation is
        being prepared; this test does not order a video or publish your
        website.
      </p>
      {paid ? (
        <p className="property-checkout-confirmed" role="status">
          <CheckCircle2 size={18} />
          Test payment confirmed. Thank you!
        </p>
      ) : (
        enabled && (
          <button
            type="button"
            className="button dark"
            onClick={start}
            disabled={busy || disabled}
          >
            <CreditCard size={17} />
            {busy ? "Opening test checkout…" : "Try $97 test checkout"}
          </button>
        )
      )}
      {message && !paid && <p role="status">{message}</p>}
      {enabled && !paid && (
        <button
          type="button"
          className="text-button"
          disabled={busy || disabled}
          onClick={async () => {
            setError("");
            try {
              if (!(await refresh()))
                setMessage(
                  "No confirmed test payment yet. If you just paid, please check again shortly.",
                );
            } catch (e) {
              setError(
                e instanceof Error
                  ? e.message
                  : "Payment status is unavailable.",
              );
            }
          }}
        >
          Check payment status
        </button>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
