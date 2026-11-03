import { Facebook, Linkedin, Mail, Printer, Share2 } from "lucide-react";
import type { Property } from "@/lib/model";
import { propertyShareLinks } from "@/lib/property-sharing";

export function PropertySharing({ property }: { property: Property }) {
  const links = propertyShareLinks(property);
  if (!links) return null;
  return (
    <section className="property-sharing" aria-label="Share published property">
      <h4>
        <Share2 size={15} /> Share your property
      </h4>
      <div className="property-share-links">
        <a href={links.facebook} target="_blank" rel="noopener noreferrer">
          <Facebook size={15} /> Facebook
        </a>
        <a href={links.x} target="_blank" rel="noopener noreferrer">
          <span aria-hidden="true">𝕏</span> X
        </a>
        <a href={links.linkedin} target="_blank" rel="noopener noreferrer">
          <Linkedin size={15} /> LinkedIn
        </a>
        <a href={links.email}>
          <Mail size={15} /> Email
        </a>
      </div>
      <a
        className="button secondary full-button"
        href={links.print}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Printer size={15} /> Save as PDF
      </a>
      <small>
        Opens a print-friendly page. Choose “Save as PDF” in the print dialog.
      </small>
    </section>
  );
}
