import Link from "next/link";
import { ArrowUpRight, House, UserRound } from "lucide-react";
import { PLATFORM_NAME } from "@/lib/platform-brand";

export function DiscoveryHeader({
  editorial = false,
}: {
  editorial?: boolean;
}) {
  return (
    <header className="discovery-header">
      <Link className="discovery-brand" href="/">
        <House
          size={editorial ? 27 : 21}
          strokeWidth={editorial ? 1.3 : 2}
          aria-hidden="true"
        />
        <span>{PLATFORM_NAME}</span>
      </Link>
      <nav aria-label="Navigare">
        <Link href="/autentificare" className="discovery-account">
          {editorial && <UserRound size={14} aria-hidden="true" />}
          Contul meu
          {!editorial && <ArrowUpRight size={14} aria-hidden="true" />}
        </Link>
      </nav>
    </header>
  );
}
