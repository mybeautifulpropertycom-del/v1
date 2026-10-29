"use client";
import { useState } from "react";
import { Download } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
export function OwnerVideoDownload({ propertyId }: { propertyId: string }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function download() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const client = getSupabase();
      const session = client
        ? (await client.auth.getSession()).data.session
        : null;
      if (!session) throw new Error("Sign in to download your video.");
      const response = await fetch("/api/video/download", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ propertyId }),
        signal: AbortSignal.timeout(30000),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Download unavailable.");
      const link = document.createElement("a");
      link.href = result.url;
      link.download = "my-beautiful-property.mp4";
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Download unavailable. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="delete-action-wrap">
      <button className="button secondary" onClick={download} disabled={busy}>
        <Download size={15} />
        {busy ? "Preparing download…" : "Download video"}
      </button>
      {error && <small role="alert">{error}</small>}
    </span>
  );
}
