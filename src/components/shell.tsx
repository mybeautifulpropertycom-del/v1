"use client";
import { PLATFORM_CONTACT_EMAIL } from "@/lib/platform-brand";
import { BrandSymbol } from "./brand-symbol";
import { AgentAvatar } from "./agent-avatar";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  ArrowUpRight,
  Building2,
  ChevronDown,
  CircleHelp,
  Globe2,
  Inbox,
  LayoutTemplate,
  LogOut,
  Mail,
  Menu,
  Plus,
  ShieldCheck,
  UserRound,
  Video,
  X,
} from "lucide-react";
import { useWorkspace } from "./workspace-provider";

const nav = [
  { href: "/panou", label: "Proprietățile mele", icon: Building2 },
  {
    href: "/panou/modele",
    label: "Modele prezentare",
    icon: LayoutTemplate,
  },
  { href: "/panou/video", label: "Studio video", icon: Video },
  { href: "/panou/mesaje", label: "Mesaje", icon: Inbox },
  { href: "/panou/profil", label: "Profilul meu", icon: UserRound },
];
export function Brand({ light = false }: { light?: boolean }) {
  return (
    <span className={`brand ${light ? "brand-light" : ""}`}>
      <BrandSymbol />
      <span>
        Următoarea <span className="brand-property">Proprietate</span>
      </span>
    </span>
  );
}
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { profile, demo, isAdmin, signOut, unreadCount } = useWorkspace();
  const [menu, setMenu] = useState(false);
  const [help, setHelp] = useState(false);
  return (
    <div className="app-shell">
      {menu && (
        <button
          className="sidebar-overlay"
          aria-label="Închide meniul"
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <Link
          href="/panou"
          className="brand-link"
          onClick={() => setMenu(false)}
        >
          <Brand />
        </Link>
        <div className="workspace-label">
          <span className="workspace-icon">
            <Building2 size={17} />
          </span>
          <span>
            Spațiul meu de lucru
            <small>
              {demo
                ? "Cont demonstrativ"
                : isAdmin
                  ? "Administrator"
                  : "Cont de agent"}
            </small>
          </span>
          <ChevronDown size={14} />
        </div>
        <span className="nav-caption">SPAȚIUL TĂU DE LUCRU</span>
        <nav aria-label="Navigare principală">
          {isAdmin && (
            <Link
              href="/panou/administrare"
              className={`nav-link ${path.startsWith("/panou/administrare") ? "active" : ""}`}
              onClick={() => setMenu(false)}
            >
              <ShieldCheck size={19} />
              <span>Administrare</span>
            </Link>
          )}
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-label={
                href === "/panou/mesaje" && unreadCount > 0
                  ? `Mesaje, ${unreadCount} mesaje necitite`
                  : undefined
              }
              className={`nav-link ${(href === "/panou" ? path === href || path.includes("/proprietati/") : path === href) ? "active" : ""}`}
              onClick={() => setMenu(false)}
            >
              <Icon size={19} />
              <span>{label}</span>
              {href === "/panou/mesaje" && unreadCount > 0 && (
                <span className="inbox-unread-badge" aria-hidden="true">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <h3>
              O proprietate.
              <br />O primă impresie memorabilă.
            </h3>
            <p>
              Detaliile fac diferența. Alege designul potrivit proprietății
              tale.
            </p>
            <Link href="/panou/modele">
              Alege stilul <ArrowUpRight size={16} />
            </Link>
          </div>
          <div className="account-row">
            <Link href="/panou/profil" className="avatar">
              <AgentAvatar profile={profile} />
            </Link>
            <Link href="/panou/profil" className="account-name">
              {profile.name || "Profilul tău"}
              <small>{profile.agency || "Agent imobiliar"}</small>
            </Link>
            <button
              className="icon-button"
              onClick={signOut}
              aria-label="Deconectare"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              aria-label="Deschide meniul"
              onClick={() => setMenu(true)}
            >
              <Menu size={22} />
            </button>
            <span className="topbar-breadcrumb">
              Spațiul tău de lucru <span>/</span>{" "}
              <strong>
                {path.startsWith("/panou/administrare")
                  ? "Administrare"
                  : nav.find((n) => n.href === path)?.label ||
                    "Editorul proprietății"}
              </strong>
            </span>
          </div>
          <div className="topbar-right">
            <span className="domain-badge">
              <Globe2 size={14} />
              Următoarea Proprietate
            </span>
            <button
              className="icon-button help-top"
              aria-label="Ajutor"
              onClick={() => setHelp(true)}
            >
              <CircleHelp size={19} />
            </button>
            <Link className="avatar small" href="/panou/profil">
              <AgentAvatar profile={profile} />
            </Link>
          </div>
        </header>
        {demo && (
          <div className="demo-banner">
            <span className="demo-indicator" />
            <strong>Explorezi versiunea demo.</strong>
            <span>
              Modificările rămân în acest browser. Conectează Supabase pentru
              publicare online.
            </span>
            <Link href="/autentificare">
              Despre conturi <ArrowUpRight size={13} />
            </Link>
          </div>
        )}
        <main className="workspace-main">{children}</main>
        <footer className="workspace-footer">
          <span>O prezentare frumoasă pentru fiecare proprietate.</span>
          <span>
            Pentru începuturi frumoase <span className="footer-star">✳</span>
          </span>
        </footer>
      </div>
      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Cum funcționează"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="icon-button modal-close"
              aria-label="Închide"
              onClick={() => setHelp(false)}
            >
              <X />
            </button>
            <span className="eyebrow">DE LA PRIMA IDEE LA PRIMA VIZIONARE</span>
            <h2>
              O prezentare reușită,
              <br />
              în câțiva pași simpli.
            </h2>
            <ol className="help-steps">
              <li>
                <strong>Completează-ți profilul</strong>
                <p>
                  Numele, telefonul și e-mailul tău apar automat pe fiecare site
                  de proprietate.
                </p>
              </li>
              <li>
                <strong>Adaugă proprietatea</strong>
                <p>
                  Încarcă fotografiile și adaugă prețul, adresa și detaliile
                  proprietății.
                </p>
              </li>
              <li>
                <strong>Alege designul</strong>
                <p>Trei designuri distincte, adaptate oricărui ecran.</p>
              </li>
              <li>
                <strong>Publică și distribuie</strong>
                <p>
                  Cu un cont conectat, linkul public poate fi accesat de
                  oricine. Previzualizările demo rămân în acest browser.
                </p>
              </li>
            </ol>
            <div className="help-actions">
              <Link
                href="/panou/proprietati/noua"
                className="button primary"
                onClick={() => setHelp(false)}
              >
                <Plus size={16} />
                Adaugă o proprietate
              </Link>
              <a
                href={`mailto:${PLATFORM_CONTACT_EMAIL}`}
                className="button secondary"
              >
                <Mail size={17} />
                Contactează-ne
              </a>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
