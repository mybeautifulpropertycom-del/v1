import type { ReactNode } from "react";

export function FooterBrand({ children }: { children: ReactNode }) {
  return (
    <a
      href="/"
      className="footer-brand"
      aria-label="My Beautiful Property home"
    >
      <span className="footer-brand-copy">{children}</span>
      <img
        src="/icon.svg"
        alt=""
        width={36}
        height={36}
        className="footer-brand-logo"
      />
    </a>
  );
}
