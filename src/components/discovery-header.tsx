import Link from "next/link";
import { ArrowUpRight, House, UserRound } from "lucide-react";
import { PLATFORM_NAME } from "@/lib/platform-brand";
import { Brand } from "./brand";

const publishHref = "/autentificare?actiune=publica";
const publishQuestion = "Vinzi sau închiriezi?";

export function DiscoveryHeader({
  variant = "classic",
}: {
  variant?: "classic" | "editorial" | "homepage";
}) {
  const editorial = variant !== "classic";
  return (
    <header className="discovery-header">
      <Link className="discovery-brand" href="/">
        {variant === "homepage" ? (
          <Brand />
        ) : (
          <>
            <House
              size={editorial ? 27 : 21}
              strokeWidth={editorial ? 1.3 : 2}
              aria-hidden="true"
            />
            <span>{PLATFORM_NAME}</span>
          </>
        )}
      </Link>
      <nav aria-label="Navigare">
        {variant === "homepage" ? (
          <>
            <div className="discovery-publish-desktop">
              <span>{publishQuestion}</span>
              <Link href={publishHref} className="discovery-publish-link">
                Publică anunțul
              </Link>
            </div>
            <button
              className="discovery-account"
              type="button"
              aria-label="Contul meu"
              popoverTarget="discovery-account-menu"
            >
              <UserRound size={14} aria-hidden="true" />
            </button>
            <div
              className="discovery-account-menu"
              id="discovery-account-menu"
              popover="auto"
            >
              <p>{publishQuestion}</p>
              <Link href={publishHref} className="discovery-publish-link">
                Publică anunțul
              </Link>
              <Link href="/autentificare" className="discovery-account-access">
                Contul meu
              </Link>
            </div>
          </>
        ) : (
          <Link href="/autentificare" className="discovery-account">
            {editorial && <UserRound size={14} aria-hidden="true" />}
            <span>Contul meu</span>
            {!editorial && <ArrowUpRight size={14} aria-hidden="true" />}
          </Link>
        )}
      </nav>
    </header>
  );
}
