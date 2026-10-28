export function FooterBrand() {
  return (
    <a
      href="/"
      className="footer-brand"
      aria-label="My Beautiful Property home"
    >
      <span className="footer-brand-credit">Made beautiful with</span>
      <span className="footer-brand-name">
        <img src="/icon.svg" alt="" width={20} height={20} />
        <strong>my beautiful property.</strong>
      </span>
    </a>
  );
}

export function FooterIdentityLogo() {
  return (
    <img
      src="/icon.svg"
      alt=""
      width={24}
      height={24}
      className="footer-identity-logo"
    />
  );
}
