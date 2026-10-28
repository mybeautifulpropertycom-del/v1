import type { ReactNode } from "react";

export function FooterBrand({ children }: { children: ReactNode }) {
  return (
    <a
      href="/"
      className="footer-brand"
      aria-label="My Beautiful Property home"
    >
      <span className="footer-brand-copy">{children}</span>
    </a>
  );
}

export function FooterIdentityLogo() {
  return (
    <img
      src="/icon.svg"
      alt=""
      width={28}
      height={28}
      className="footer-identity-logo"
    />
  );
}
