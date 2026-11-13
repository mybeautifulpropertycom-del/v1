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
          "Unele fotografii nu s-au încărcat. Poți anula imprimarea și reîncerca după ce devin disponibile.",
        );
      window.print();
    } catch {
      setNotice(
        "Imprimarea nu a putut fi deschisă. Folosește meniul Imprimare al browserului și alege Salvează ca PDF.",
      );
    } finally {
      clearTimeout(timer);
      setBusy(false);
    }
  }
  return (
    <div className="property-print-toolbar">
      <div>
        <strong>Proprietatea ta, pregătită pentru distribuire</strong>
        <p>
          Alege „Salvează ca PDF” în fereastra de imprimare a browserului.
          Filmul și formularele interactive sunt disponibile pe site.
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
        {busy ? "Se pregătesc fotografiile…" : "Imprimă / Salvează ca PDF"}
      </button>
      <a className="text-button" href={publicUrl}>
        Vezi site-ul publicat
      </a>
    </div>
  );
}
