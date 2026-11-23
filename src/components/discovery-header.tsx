import Link from "next/link";
import { ArrowUpRight, House, UserRound } from "lucide-react";
import { PLATFORM_NAME } from "@/lib/platform-brand";
import { Brand } from "./brand";
import "@/styles/discovery-header.css";

const publishHref = "/autentificare?actiune=publica";
const publishQuestion = "Vinzi sau închiriezi?";

export function DiscoveryHeader({
  variant = "classic",
}: {
  variant?: "classic" | "platform";
}) {
  const platform = variant === "platform";
  return (
    <header
      className={
        platform
          ? "discovery-header discovery-platform-header"
          : "discovery-header"
      }
    >
      <Link className="discovery-brand" href="/">
        {platform ? (
          <Brand uniformDesktopWordmark />
        ) : (
          <>
            <House size={21} aria-hidden="true" />
            <span>{PLATFORM_NAME}</span>
          </>
        )}
      </Link>
      <nav aria-label="Navigare">
        {platform ? (
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
              aria-label="Opțiuni de publicare"
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
            </div>
          </>
        ) : (
          <Link href="/autentificare" className="discovery-account">
            <span>Contul meu</span>
            <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        )}
      </nav>
    </header>
  );
}
