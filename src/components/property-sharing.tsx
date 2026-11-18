"use client";

import { useEffect, useState } from "react";
import { Check, Facebook, FileDown, Link2, Share2 } from "lucide-react";
import type { Property } from "@/lib/model";
import {
  propertyShareLinks,
  propertyShareSource,
} from "@/lib/property-sharing";
import { PropertyGroupPost } from "./property-group-post";

export function PropertySharing({ property }: { property: Property }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const links = propertyShareLinks(property);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 3000);
    return () => clearTimeout(timer);
  }, [copied]);
  if (!links) return null;
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(links!.url);
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopyError(true);
    }
  }
  return (
    <section
      className="property-sharing"
      aria-label="Distribuie proprietatea publicată"
    >
      <h4>
        <Share2 size={15} /> Distribuie proprietatea
      </h4>
      <div className="property-share-links">
        <button type="button" onClick={() => setOpen(true)}>
          <Facebook size={18} /> Publică pe Facebook
        </button>
        <button type="button" onClick={copyLink}>
          {copied ? <Check size={18} /> : <Link2 size={18} />}
          {copied ? "Link copiat" : "Copiază link-ul"}
        </button>
        <a href={links.print} target="_blank" rel="noopener noreferrer">
          <FileDown size={18} /> Salvează ca PDF
        </a>
      </div>
      {copied && (
        <small role="status">Linkul proprietății a fost copiat.</small>
      )}
      {copyError && (
        <label className="property-share-manual">
          Copiază manual linkul
          <input
            readOnly
            value={links.url}
            onFocus={(event) => event.target.select()}
          />
        </label>
      )}
      {open && (
        <PropertyGroupPost
          key={propertyShareSource(property)}
          property={property}
          onClose={() => setOpen(false)}
        />
      )}
    </section>
  );
}
