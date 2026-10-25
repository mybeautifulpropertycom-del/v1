"use client";
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
  Menu,
  Plus,
  Sparkles,
  UserRound,
  Video,
  X,
} from "lucide-react";
import { useWorkspace } from "./workspace-provider";

const nav = [
  { href: "/dashboard", label: "My properties", icon: Building2 },
  {
    href: "/dashboard/templates",
    label: "Design templates",
    icon: LayoutTemplate,
  },
  { href: "/dashboard/video", label: "Video studio", icon: Video, soon: true },
  { href: "/dashboard/inquiries", label: "My inbox", icon: Inbox },
  { href: "/dashboard/profile", label: "My profile", icon: UserRound },
];
export function Brand({ light = false }: { light?: boolean }) {
  return (
    <span className={`brand ${light ? "brand-light" : ""}`}>
      <span className="brand-symbol">
        m<span>.</span>
      </span>
      <span>
        my beautiful
        <span className="brand-property">
          property<span className="brand-dot">.</span>
        </span>
      </span>
    </span>
  );
}
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { profile, demo, signOut } = useWorkspace();
  const [menu, setMenu] = useState(false);
  const [help, setHelp] = useState(false);
  return (
    <div className="app-shell">
      {menu && (
        <button
          className="sidebar-overlay"
          aria-label="Close menu"
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <Link
          href="/dashboard"
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
            My workspace<small>{demo ? "Demo account" : "Agent account"}</small>
          </span>
          <ChevronDown size={14} />
        </div>
        <span className="nav-caption">YOUR WORKSPACE</span>
        <nav aria-label="Main navigation">
          {nav.map(({ href, label, icon: Icon, soon }) => (
            <Link
              key={href}
              href={href}
              className={`nav-link ${(href === "/dashboard" ? path === href || path.includes("/properties/") : path === href) ? "active" : ""}`}
              onClick={() => setMenu(false)}
            >
              <Icon size={19} />
              <span>{label}</span>
              {soon && <span className="soon-dot" />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="note-spark">
              <Sparkles size={19} />
            </span>
            <h3>
              One property.
              <br />
              One beautiful first impression.
            </h3>
            <p>
              Details make the difference. Find a design that feels like home.
            </p>
            <Link href="/dashboard/templates">
              Find your style <ArrowUpRight size={16} />
            </Link>
          </div>
          <button className="sidebar-help" onClick={() => setHelp(true)}>
            <CircleHelp size={18} />
            How it works
          </button>
          <div className="account-row">
            <Link href="/dashboard/profile" className="avatar">
              <AgentAvatar profile={profile} />
            </Link>
            <Link href="/dashboard/profile" className="account-name">
              {profile.name || "Your profile"}
              <small>{profile.agency || "Real estate agent"}</small>
            </Link>
            <button
              className="icon-button"
              onClick={signOut}
              aria-label="Sign out"
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
              aria-label="Open menu"
              onClick={() => setMenu(true)}
            >
              <Menu size={22} />
            </button>
            <span className="topbar-breadcrumb">
              Your workspace <span>/</span>{" "}
              <strong>
                {nav.find((n) => n.href === path)?.label || "Property editor"}
              </strong>
            </span>
          </div>
          <div className="topbar-right">
            <span className="domain-badge">
              <Globe2 size={14} />
              mybeautifulproperty.com
            </span>
            <button
              className="icon-button help-top"
              aria-label="Help"
              onClick={() => setHelp(true)}
            >
              <CircleHelp size={19} />
            </button>
            <Link className="avatar small" href="/dashboard/profile">
              <AgentAvatar profile={profile} />
            </Link>
          </div>
        </header>
        {demo && (
          <div className="demo-banner">
            <span className="demo-indicator" />
            <strong>You’re exploring the demo.</strong>
            <span>
              Changes stay in this browser. Connect Supabase to publish online.
            </span>
            <Link href="/login">
              About accounts <ArrowUpRight size={13} />
            </Link>
          </div>
        )}
        <main className="workspace-main">{children}</main>
        <footer className="workspace-footer">
          <span>A beautiful place for every property.</span>
          <span>
            Made for beautiful beginnings <span className="footer-star">✳</span>
          </span>
        </footer>
      </div>
      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="How it works"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="icon-button modal-close"
              aria-label="Close"
              onClick={() => setHelp(false)}
            >
              <X />
            </button>
            <span className="eyebrow">FROM FIRST IDEA TO FIRST SHOWING</span>
            <h2>
              A beautiful listing,
              <br />
              in a few simple steps.
            </h2>
            <ol className="help-steps">
              <li>
                <strong>Make it yours</strong>
                <p>
                  Your name, phone, and email automatically appear on every
                  property website.
                </p>
              </li>
              <li>
                <strong>Add your property</strong>
                <p>
                  Upload your photos and add the price, location, and property
                  details.
                </p>
              </li>
              <li>
                <strong>Set the scene</strong>
                <p>
                  Three distinct designs, each beautifully responsive on every
                  screen.
                </p>
              </li>
              <li>
                <strong>Publish and share</strong>
                <p>
                  With a connected account, your public link works for everyone.
                  Demo previews stay in this browser.
                </p>
              </li>
            </ol>
            <Link
              href="/dashboard/properties/new"
              className="button primary"
              onClick={() => setHelp(false)}
            >
              <Plus size={16} />
              Add a property
            </Link>
          </section>
        </div>
      )}
    </div>
  );
}
