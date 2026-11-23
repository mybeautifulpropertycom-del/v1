import Link from "next/link";
import { ArrowUpRight, House } from "lucide-react";
import { PLATFORM_NAME } from "@/lib/platform-brand";

export function DiscoveryHeader() {
  return (
    <header className="discovery-header">
      <Link className="discovery-brand" href="/">
        <House size={21} aria-hidden="true" />
        <span>{PLATFORM_NAME}</span>
      </Link>
      <nav aria-label="Navigare">
        <Link href="/autentificare" className="discovery-account">
          Contul meu <ArrowUpRight size={14} aria-hidden="true" />
        </Link>
      </nav>
    </header>
  );
}
