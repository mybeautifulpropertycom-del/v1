export function FooterBrand() {
  return (
    <a
      href="/"
      className="footer-brand"
      aria-label="Pagina principală Următoarea Proprietate"
    >
      <span className="footer-brand-credit">Creat cu</span>
      <span className="footer-brand-name">
        <img src="/icon.svg" alt="" width={20} height={20} />
        <strong>Următoarea Proprietate</strong>
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
