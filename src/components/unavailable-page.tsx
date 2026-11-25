import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { UNAVAILABLE_PAGE_TITLE } from "@/lib/published-property";
import { DiscoveryHeader } from "./discovery-header";
import "@/styles/discovery.css";
import "@/styles/unavailable-page.css";

export function UnavailablePage({
  title = UNAVAILABLE_PAGE_TITLE,
}: {
  title?: string;
}) {
  return (
    <div className="discovery-site discovery-unavailable">
      <DiscoveryHeader variant="platform" />
      <main className="discovery-unavailable-content">
        <h1>{title}</h1>
        <Link href="/#cautare" className="button primary">
          Vezi alte proprietăți
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </main>
    </div>
  );
}
