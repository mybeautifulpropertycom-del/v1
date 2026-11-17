"use client";
import { presentationCopy, propertyInvitation } from "@/lib/presentation-copy";
import { propertyTypeLabel } from "@/lib/model";
import { PropertyMortgage } from "./property-mortgage";
import { PropertyNeighbourhood } from "./property-neighbourhood";
import { PropertyImage } from "./property-image";
import { AgentAvatar } from "./agent-avatar";
import { FooterBrand, FooterIdentityLogo } from "./footer-brand";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  Expand,
  Film,
  Mail,
  MapPin,
  Phone,
  Plus,
  X,
} from "lucide-react";
import { formatPrice, safePhone } from "@/lib/model";
import {
  propertyStory,
  propertyOpeningAccent,
  type WebsiteCopyField,
} from "@/lib/property-story";
import { EditableText } from "./website-editable-text";
import type { PropertyWebsiteProps } from "./property-website";
import { PropertyPhotoDialog } from "./property-photo-dialog";
import { ViewingDialog } from "./viewing-dialog";

export function AtelierWebsite({
  property,
  profile,
  preview = false,
  sample = false,
  onEdit,
  film,
  videoPanel,
  previewBackLink,
}: PropertyWebsiteProps) {
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [viewing, setViewing] = useState(false);
  const [menu, setMenu] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    message: "",
    website: "",
  });
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const copy = propertyStory(property);
  const isPreview = preview || sample;
  const side = property.images.slice(1, 7);
  const unit = property.area_unit === "sqm" ? "m²" : "sq ft";
  const secondary = property.images[1] || property.images[0];
  const detail = property.images[2] || secondary;
  const initials = profile.name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");
  const text = (field: WebsiteCopyField) => (
    <EditableText field={`copy.${field}`} value={copy[field]} onEdit={onEdit} />
  );
  const tour = (className = "atelier-button") => (
    <button
      type="button"
      className={className}
      onClick={() => setViewing(true)}
    >
      Programează o vizionare <ArrowUpRight size={17} />
    </button>
  );
  const photo = (src: string, index: number, className = "") => (
    <button
      type="button"
      className={className}
      key={`${src}-${index}`}
      onClick={() => setLightbox(index)}
      aria-label={`Mărește fotografia proprietății ${index + 1}`}
    >
      <PropertyImage
        src={src}
        alt={
          copy.captions[index] || `${property.title} — fotografia ${index + 1}`
        }
        loading="lazy"
      />
      <span className="atelier-expand">
        <Expand size={17} />
      </span>
    </button>
  );
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (preview || sample) {
      setStatus(
        "Aceasta este o previzualizare. Nu a fost trimis niciun mesaj.",
      );
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, slug: property.slug }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error ||
            "Mesajul nu a putut fi trimis. Încearcă din nou sau contactează direct agentul.",
        );
      setSent(true);
      setStatus(
        "Mesajul a ajuns la agent. Te poate contacta folosind datele pe care le-ai oferit.",
      );
    } catch (e) {
      setStatus(
        e instanceof Error ? e.message : "Mesajul nu a putut fi trimis.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="atelier-website website-panorama">
      {isPreview && (
        <div className="preview-bar">
          <Link
            href={
              previewBackLink?.href ||
              (sample ? "/panou/modele" : `/panou/proprietati/${property.id}`)
            }
          >
            <ArrowLeft size={15} />
            {previewBackLink?.label ||
              (sample ? "Înapoi la colecție" : "Înapoi la editor")}
          </Link>
          <span>
            {sample
              ? "Previzualizare design · Proprietate demonstrativă"
              : "Previzualizarea site-ului salvat · Nu este un link public"}
          </span>
          {sample && (
            <Link href="/panou/proprietati/noua?template=panorama">
              Folosește acest design <ArrowUpRight size={14} />
            </Link>
          )}
        </div>
      )}
      <header className="atelier-nav" id="home">
        <a className="atelier-brand" href="#home">
          <span className="atelier-brand-mark">
            {initials || "A"}
            <ArrowUpRight size={17} />
          </span>
          <span>
            {profile.agency || profile.name || "Agentul tău"}
            <small>O PERSPECTIVĂ MAI PERSONALĂ</small>
          </span>
        </a>
        <nav aria-label="Navigarea proprietății">
          <a href="#residence">Locuința</a>
          <a href="#gallery">Fotografii</a>
          <a href="#contact">Agentul tău</a>
        </nav>
        <button
          className="atelier-menu-button"
          aria-expanded={menu}
          aria-controls="atelier-menu"
          onClick={() => setMenu(!menu)}
        >
          {menu ? "Închide" : "Meniu"}
          {menu ? <X size={18} /> : <Plus size={18} />}
        </button>
        {menu && (
          <nav
            id="atelier-menu"
            className="atelier-menu"
            aria-label="Mai multe secțiuni ale proprietății"
          >
            <a href="#residence" onClick={() => setMenu(false)}>
              Locuința <ArrowUpRight />
            </a>
            <a href="#details" onClick={() => setMenu(false)}>
              Detalii <ArrowUpRight />
            </a>
            <a href="#gallery" onClick={() => setMenu(false)}>
              Toate fotografiile <ArrowUpRight />
            </a>
            <a href="#contact" onClick={() => setMenu(false)}>
              Cunoaște agentul <ArrowUpRight />
            </a>
            {tour()}
          </nav>
        )}
      </header>
      <main>
        <section
          className={`atelier-mosaic ${side.length ? "" : "atelier-mosaic-single"}`}
          aria-label="Fotografiile proprietății"
        >
          {property.images[0] ? (
            <button
              className="atelier-cover"
              onClick={() => setLightbox(0)}
              aria-label="Mărește prima fotografie a proprietății"
            >
              <PropertyImage
                src={property.images[0]}
                alt={`${property.title} — fotografie de copertă`}
                fetchPriority="high"
                sizes="100vw"
              />
              <span className="atelier-cover-label">
                {propertyTypeLabel(property.type)}
                <span>
                  {property.transaction === "rent"
                    ? "DE ÎNCHIRIAT"
                    : "DE VÂNZARE"}
                </span>
              </span>
              <span className="atelier-cover-note">
                O primă privire. <ArrowUpRight size={18} />
              </span>
            </button>
          ) : (
            <div className="atelier-no-photo">
              Aici vor apărea fotografiile proprietății tale.
            </div>
          )}
          {side.length > 0 && (
            <div
              className="atelier-mosaic-side"
              style={{
                gridTemplateColumns: `repeat(${Math.ceil(side.length / 2)}, minmax(0,1fr))`,
              }}
              data-odd={side.length % 2 === 1}
              data-count={side.length}
            >
              {side.map((src, index) => photo(src, index + 1))}
            </div>
          )}
          {property.images.length > 0 && (
            <button
              className="atelier-all-photos"
              onClick={() => setLightbox(0)}
            >
              <Expand size={14} />
              Vezi toate cele {property.images.length} fotografii
            </button>
          )}
        </section>
        <section className="atelier-intro atelier-pad" id="residence">
          <div className="atelier-intro-top">
            <span className="atelier-kicker">
              <MapPin size={13} />
              <EditableText
                field="location"
                value={property.location || "Adresa proprietății"}
                onEdit={onEdit}
              />
            </span>
            <a href="#details" className="atelier-text-link">
              Descoperă detaliile <ArrowRight size={16} />
            </a>
          </div>
          <div className="atelier-title-row">
            <div className="atelier-intro-copy">
              <span className="atelier-kicker atelier-opening-accent">
                {propertyOpeningAccent(property, copy.heroLine)}
              </span>
              <h1>
                <EditableText
                  field="title"
                  value={property.title || "O altă perspectivă."}
                  onEdit={onEdit}
                />
              </h1>
              <p>{text("introBody")}</p>
            </div>
            <div className="atelier-intro-price">
              <span className="atelier-kicker">
                {property.transaction === "rent"
                  ? "Chirie lunară"
                  : "Preț de vânzare"}
              </span>
              <p className="atelier-price" aria-label={formatPrice(property)}>
                <span>
                  {property.price.toLocaleString("ro-RO", {
                    maximumFractionDigits: 0,
                  })}
                </span>{" "}
                <small>{property.currency}</small>
                {property.transaction === "rent" && (
                  <small className="atelier-price-period">/ lună</small>
                )}
              </p>
              {tour()}
            </div>
          </div>
          <dl className="atelier-facts">
            <div>
              <dt>Suprafață locuibilă</dt>
              <dd>
                {property.area.toLocaleString("ro-RO")} <small>{unit}</small>
              </dd>
            </div>
            <div>
              <dt>Dormitoare</dt>
              <dd>{property.bedrooms}</dd>
            </div>
            <div>
              <dt>Băi</dt>
              <dd>{property.bathrooms}</dd>
            </div>
            <div>
              <dt>Tipul proprietății</dt>
              <dd className="atelier-type">
                {propertyTypeLabel(property.type)}
              </dd>
            </div>
          </dl>
        </section>
        <section className="atelier-story atelier-pad">
          <figure>
            {secondary ? (
              photo(
                secondary,
                property.images[1] ? 1 : 0,
                "atelier-story-photo",
              )
            ) : (
              <div className="atelier-no-photo">O privire mai atentă</div>
            )}
            <figcaption>
              <span>O PRIVIRE MAI ATENTĂ</span>
              <span>{property.location}</span>
            </figcaption>
          </figure>
          <div className="atelier-story-copy">
            <span className="atelier-kicker">SIMTE-TE ACASĂ</span>
            <h2 className="presentation-section-heading">
              {presentationCopy.introduction.title}
              <em>{presentationCopy.introduction.accent}</em>
            </h2>
            <p>{text("storyBody")}</p>
            <a className="atelier-round-link" href="#gallery">
              <span>Descoperă această proprietate</span>
              <ArrowUpRight size={24} />
            </a>
          </div>
        </section>
        <section className="atelier-details atelier-pad" id="details">
          <div className="atelier-details-heading">
            <span className="atelier-kicker">DETALIILE CARE CONTEAZĂ</span>
            <h2>
              {text("detailsTitle")}
              <em>{text("detailsAccent")}</em>
            </h2>
          </div>
          <div className="atelier-details-copy">
            <dl className="atelier-spec-grid">
              <div>
                <dt>Suprafață locuibilă</dt>
                <dd>
                  {property.area.toLocaleString("ro-RO")} <small>{unit}</small>
                </dd>
              </div>
              <div>
                <dt>Tipul proprietății</dt>
                <dd>{propertyTypeLabel(property.type)}</dd>
              </div>
              <div>
                <dt>Dormitoare</dt>
                <dd>{property.bedrooms.toString().padStart(2, "0")}</dd>
              </div>
              <div>
                <dt>Băi</dt>
                <dd>{property.bathrooms.toString().padStart(2, "0")}</dd>
              </div>
              <div className="atelier-spec-location">
                <dt>Adresă</dt>
                <dd>{property.location}</dd>
              </div>
              <div>
                <dt>
                  {property.transaction === "rent" ? "Chirie lunară" : "Preț"}
                </dt>
                <dd>{formatPrice(property)}</dd>
              </div>
            </dl>
            {property.amenities.length > 0 && (
              <div className="atelier-extras">
                <h3>Dotări atent alese</h3>
                <ul>
                  {property.amenities.map((amenity) => (
                    <li key={amenity}>{amenity}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="atelier-details-tour">{tour()}</div>
          </div>
          <div className="atelier-detail-image">
            {detail ? (
              photo(detail, property.images[2] ? 2 : property.images[1] ? 1 : 0)
            ) : (
              <div className="atelier-no-photo">Detaliile fac diferența.</div>
            )}
            <span>
              DETALIILE FAC DIFERENȚA <ArrowUpRight size={18} />
            </span>
          </div>
        </section>
        <section className="atelier-gallery atelier-pad" id="gallery">
          <div className="atelier-section-heading">
            <div>
              <h2 className="presentation-section-heading">
                {presentationCopy.gallery.title}
                <em>{presentationCopy.gallery.accent}</em>
              </h2>
            </div>
            <div>
              <p>{text("galleryBody")}</p>
            </div>
          </div>
          <div className="atelier-photo-grid">
            {property.images.map((src, index) => (
              <figure key={`${src}-${index}`}>{photo(src, index)}</figure>
            ))}
          </div>
          {!property.images.length && <p>Fotografiile tale vor apărea aici.</p>}
        </section>
        {(film?.src || isPreview) && (
          <section className="atelier-film atelier-pad" id="film">
            <div className="atelier-film-heading">
              <h2>
                Pășește înăuntru.<em>Simte-te acasă.</em>
              </h2>
            </div>
            {film?.src && videoPanel}
            {film?.src ? (
              <video
                controlsList="nodownload"
                onContextMenu={(event) => event.preventDefault()}
                controls
                playsInline
                preload="metadata"
                poster={film.poster || property.images[0]}
                aria-label={`${property.title} — filmul proprietății`}
              >
                <source src={film.src} />
                {film.captions && (
                  <track
                    kind="captions"
                    src={film.captions}
                    srcLang="en"
                    label="Engleză"
                    default
                  />
                )}
              </video>
            ) : videoPanel ? (
              videoPanel
            ) : (
              <div
                className="atelier-film-placeholder"
                style={
                  property.images[0]
                    ? {
                        backgroundImage: `linear-gradient(#0005,#0008),url("${property.images[0]}")`,
                      }
                    : undefined
                }
              >
                <Film size={32} strokeWidth={1} />
                <p>Filmul proprietății va apărea aici când este gata.</p>
                <small>
                  Previzualizarea secțiunii video · Nu a fost generat încă
                  niciun film
                </small>
              </div>
            )}
          </section>
        )}
        <PropertyNeighbourhood property={property} sample={sample} />
        <PropertyMortgage property={property} />
        <section className="atelier-contact atelier-pad" id="contact">
          <div className="landing-agent">
            <span className="atelier-kicker presentation-agent-kicker">
              {presentationCopy.agent.subtitle}
            </span>
            <h2 className="presentation-agent-heading">
              {presentationCopy.agent.title}
            </h2>
            <div className="landing-agent-profile">
              <span className="atelier-avatar">
                <AgentAvatar profile={profile} />
              </span>
              <div>
                <strong>{profile.name}</strong>
                <span>{profile.agency}</span>
              </div>
            </div>
            {profile.bio && <p>{profile.bio}</p>}
            <div className="atelier-agent-links">
              {profile.phone && (
                <a href={`tel:${safePhone(profile.phone)}`}>
                  <Phone size={17} />
                  {profile.phone}
                  <ArrowUpRight size={15} />
                </a>
              )}
              {profile.email && (
                <a href={`mailto:${profile.email}`}>
                  <Mail size={17} />
                  {profile.email}
                  <ArrowUpRight size={15} />
                </a>
              )}
            </div>
            {tour()}
          </div>
          <form className="landing-inquiry" onSubmit={submit}>
            <h3 className="presentation-inquiry-heading">
              {presentationCopy.inquiry.title}
            </h3>
            <p>{presentationCopy.inquiry.subtitle}</p>
            <label>
              Numele tău
              <input
                required
                name="name"
                autoComplete="name"
                maxLength={100}
                placeholder="Alex Popescu"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <div className="field-grid">
              <label>
                Adresă de e-mail
                <input
                  type="email"
                  required
                  name="email"
                  autoComplete="email"
                  maxLength={254}
                  placeholder="nume@email.ro"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </label>
              <label>
                Telefon
                <input
                  type="tel"
                  name="phone"
                  autoComplete="tel"
                  maxLength={30}
                  placeholder="+40 700 000 000"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </label>
            </div>
            <label>
              Mesajul tău (opțional)
              <textarea
                minLength={10}
                maxLength={2000}
                rows={3}
                placeholder="Aș vrea să aflu mai multe despre această locuință…"
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
              />
            </label>
            <div className="honeypot" aria-hidden="true">
              <label>
                Lasă acest câmp gol
                <input
                  tabIndex={-1}
                  autoComplete="off"
                  value={form.website}
                  onChange={(e) =>
                    setForm({ ...form, website: e.target.value })
                  }
                />
              </label>
            </div>
            <button className="landing-button" disabled={busy || sent}>
              {busy
                ? "Se trimite…"
                : sent
                  ? "Mesaj primit"
                  : preview || sample
                    ? "Încearcă formularul de contact"
                    : "Trimite mesajul"}
              {sent ? <Check size={17} /> : <ArrowUpRight size={17} />}
            </button>
            <small>
              Prin trimitere, ești de acord să fii contactat de{" "}
              {profile.name || "agent"} în legătură cu această proprietate.
            </small>
            {(preview || sample) && (
              <small className="preview-form-note">
                Doar previzualizare. Acest formular nu trimite mesaje.
              </small>
            )}
            {status && (
              <p
                className={`inquiry-status ${sent ? "success" : ""}`}
                role="status"
              >
                {status}
              </p>
            )}
          </form>
        </section>
        <section className="atelier-invitation atelier-pad">
          {property.images[0] && (
            <PropertyImage
              className="atelier-invitation-background"
              src={property.images[0]}
              alt=""
              loading="lazy"
              aria-hidden="true"
            />
          )}
          <span className="atelier-kicker">
            {presentationCopy.invitation.eyebrow}
          </span>
          <h2 className="presentation-invitation-heading">
            {presentationCopy.invitation.title}
            <br />
            <em>{presentationCopy.invitation.accent}</em>
          </h2>
          <p>{propertyInvitation(property.location)}</p>
          {tour()}
          <span className="atelier-invitation-footnote">
            {presentationCopy.invitation.note}
          </span>
        </section>
      </main>
      <footer className="atelier-footer atelier-pad property-footer">
        <a href="#home" className="footer-identity">
          <FooterIdentityLogo />
          <span className="footer-agent-details">
            <span>{profile.agency || profile.name}</span>
            <span className="footer-mobile-address">{property.location}</span>
          </span>
          <ArrowUpRight size={16} />
        </a>
        <FooterBrand />
      </footer>
      <div className="atelier-mobile-tour">
        <span>
          {formatPrice(property)}
          <small>
            {property.transaction === "rent" ? "Chirie lunară" : "Preț"}
          </small>
        </span>
        {tour()}
      </div>
      {lightbox !== null && property.images.length > 0 && (
        <PropertyPhotoDialog
          images={property.images}
          title={property.title}
          initial={lightbox}
          onClose={() => setLightbox(null)}
        />
      )}
      {viewing && (
        <ViewingDialog
          title={property.title}
          slug={property.slug}
          agentName={profile.name}
          preview={isPreview}
          onClose={() => setViewing(false)}
        />
      )}
    </div>
  );
}
