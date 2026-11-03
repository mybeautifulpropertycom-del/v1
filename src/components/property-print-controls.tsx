"use client";

import { useState } from "react";
import { Printer } from "lucide-react";

export function PropertyPrintControls({ publicUrl }: { publicUrl: string }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function print() {
    if (busy) return;
    setBusy(true);
    setNotice("");
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.all([
          document.fonts.ready,
          ...Array.from(
            document.querySelectorAll<HTMLImageElement>(".property-print img"),
          ).map((image) => image.decode().catch(() => undefined)),
        ]),
        new Promise((resolve) => {
          timer = setTimeout(resolve, 15000);
        }),
      ]);
      const missing = Array.from(
        document.querySelectorAll<HTMLImageElement>(".property-print img"),
      ).some((image) => !image.complete || image.naturalWidth === 0);
      if (missing)
        setNotice(
          "Some photos have not loaded. You can cancel printing and try again when they are available.",
        );
      window.print();
    } catch {
      setNotice(
        "Printing could not open. Use your browser’s Print menu, then choose Save as PDF.",
      );
    } finally {
      clearTimeout(timer);
      setBusy(false);
    }
  }
  return (
    <div className="property-print-toolbar">
      <div>
        <strong>Your property, ready to share</strong>
        <p>
          Choose “Save as PDF” as the destination in your browser’s print
          dialog. Video and interactive forms are available on the website.
        </p>
        {notice && <p role="status">{notice}</p>}
      </div>
      <button
        type="button"
        className="button primary"
        onClick={print}
        disabled={busy}
      >
        <Printer size={16} />
        {busy ? "Preparing photos…" : "Print / Save as PDF"}
      </button>
      <a className="text-button" href={publicUrl}>
        View published website
      </a>
    </div>
  );
}
