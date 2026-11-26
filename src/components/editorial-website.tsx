"use client";
import { presentationCopy, propertyInvitation } from "@/lib/presentation-copy";
import { propertyExtraDetail, propertyTypeLabel } from "@/lib/model";
import { PropertyMortgage } from "./property-mortgage";
import { PropertyNeighbourhood } from "./property-neighbourhood";
import { PropertySectionLinks } from "./property-section-links";
import { PropertyImage } from "./property-image";
import { AgentAvatar } from "./agent-avatar";
import { PropertyWhatsAppLink } from "./property-whatsapp-link";
import { PropertyMobileContact } from "./property-mobile-contact";
import { FooterBrand, FooterIdentityLogo } from "./footer-brand";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  Check,
  Expand,
  Film,
  Mail,
  Menu,
  X,
  Phone,
} from "lucide-react";
import { propertyStory } from "@/lib/property-story";
import { formatPrice, safePhone } from "@/lib/model";
import type { PropertyWebsiteProps } from "./property-website";
import { EditableText } from "./website-editable-text";
import { ViewingDialog } from "./viewing-dialog";
import { PropertyPhotoDialog } from "./property-photo-dialog";

/** A completed, browser-playable film supplied by a future video integration. */
export type PropertyFilm = { src: string; poster?: string; captions?: string };

const SCROLL_GALLERY_CAPTIONS = [
  ["Imaginează-ți", "cum ar fi să locuiești aici."],
  ["Fă loc", "următorului tău capitol."],
  ["Vino acasă", "în spațiul tău."],
  ["Mai rămâi puțin.", "Privește mai atent."],
  ["O nouă adresă.", "Un nou început."],
  ["Imaginează-ți", "viața de zi cu zi aici."],
  ["Vino cu planurile tale.", "Transformă acest loc în acasă."],
  ["Găsește un loc", "în care să prinzi rădăcini."],
  ["Următoarea ta mutare", "ar putea începe aici."],
  ["Gândește-te la oamenii", "pe care i-ai primi aici."],
  ["Un loc în care să revii.", "Un loc al tău."],
  ["Privește în tihnă.", "Descoperă ce ți se potrivește."],
  ["Dă-ți voie să te", "simți acasă."],
  ["Un nou început", "cu loc pentru tine."],
  ["Transformă o posibilitate", "în casa ta."],
  ["Descoperă detaliile.", "Imaginează-ți zilele aici."],
  ["Unde ar putea", "începe povestea ta?"],
  ["Imaginează-ți momentul", "în care primești cheile."],
  ["Mai sunt multe", "de descoperit aici."],
  ["Descoperă locul personal.", "Imaginează-ți ce urmează."],
] as const;

function ScrollGallery({ images, title }: { images: string[]; title: string }) {
  const stage = useRef<HTMLDivElement>(null);
  const sticky = useRef<HTMLDivElement>(null);
  const [supportsSticky, setSupportsSticky] = useState(false);
  const [active, setActive] = useState(0);
  const steps = images.length - 1;
  const pinned = supportsSticky && steps > 0;

  useEffect(() => {
    setSupportsSticky(
      window.CSS?.supports?.("position", "sticky") ||
        window.CSS?.supports?.("position", "-webkit-sticky") ||
        false,
    );
  }, []);

  useEffect(() => {
    const root = stage.current;
    const viewport = sticky.current;
    if (!pinned || !root || !viewport) return;
    let frame = 0;
    const visualViewport = window.visualViewport;
    const update = () => {
      frame = 0;
      const distance = Math.max(1, root.offsetHeight - viewport.offsetHeight);
      const progress = -root.getBoundingClientRect().top / distance;
      setActive(Math.max(0, Math.min(steps, Math.round(progress * steps))));
    };
    function schedule() {
      if (!frame) frame = requestAnimationFrame(update);
    }
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    visualViewport?.addEventListener("resize", schedule);
    update();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      visualViewport?.removeEventListener("resize", schedule);
    };
  }, [pinned, steps]);

  if (!images.length) return null;
  return (
    <section
      className="estate-scroll-gallery"
      aria-label="Descoperă proprietatea în fotografii"
    >
      <div
        className="estate-scroll-stage"
        ref={stage}
        data-pinned={pinned ? "true" : undefined}
        style={{ "--estate-scroll-steps": steps } as CSSProperties}
      >
        <div className="estate-scroll-sticky" ref={sticky}>
          <div
            className="estate-scenes"
            role="group"
            aria-label="Fotografiile proprietății"
          >
            {images.map((image, index) => {
              const caption = SCROLL_GALLERY_CAPTIONS[index];
              return (
                <div
                  key={`${image}-${index}`}
                  className={`estate-scene ${active === index ? "is-active" : ""}`}
                  aria-hidden={active !== index || undefined}
                >
                  {(pinned
                    ? Math.abs(index - active) <= 1
                    : active === index) && (
                    <PropertyImage
                      src={image}
                      alt={`${title} — fotografia ${index + 1}`}
                      loading="lazy"
                      sizes="100vw"
                    />
                  )}
                  <div className="estate-scene-copy">
                    <span className="estate-eyebrow">O altă perspectivă</span>
                    <h3>
                      {caption[0]}
                      <br />
                      <em>{caption[1]}</em>
                    </h3>
                    <p>
                      O locuință înseamnă mai mult decât prima impresie.
                      <br />
                      Imaginează-te aici.
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

export function EditorialWebsite({
  property,
  profile,
  preview = false,
  sample = false,
  onEdit,
  film,
  videoPanel,
  videoIncluded = true,
  previewBackLink,
}: PropertyWebsiteProps) {
  const [viewing, setViewing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigation = useRef<HTMLElement>(null);
  const menuToggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const desktop = matchMedia("(min-width: 900px)");
    const closeOnDesktop = () => {
      if (desktop.matches) setMenuOpen(false);
    };
    const closeOutside = (event: PointerEvent) => {
      if (!navigation.current?.contains(event.target as Node))
        setMenuOpen(false);
    };
    desktop.addEventListener("change", closeOnDesktop);
    document.addEventListener("pointerdown", closeOutside);
    return () => {
      desktop.removeEventListener("change", closeOnDesktop);
      document.removeEventListener("pointerdown", closeOutside);
    };
  }, [menuOpen]);
  const [lightbox, setLightbox] = useState<number | null>(null);
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
  const isPreview = preview || sample;
  const showFilm = videoIncluded && (Boolean(film?.src) || isPreview);
  const copy = propertyStory(property);
  const unit = property.area_unit === "sqm" ? "m²" : "sq ft";
  const extraDetail = propertyExtraDetail(property);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || sent) return;
    if (isPreview) {
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
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Mesajul nu a putut fi trimis.",
      );
    } finally {
      setBusy(false);
    }
  }

  const viewingButton = (
    label: string,
    className = "estate-button",
    Icon = ArrowUpRight,
  ) => (
    <button
      type="button"
      className={className}
      aria-label={label}
      onClick={() => {
        setMenuOpen(false);
        setViewing(true);
      }}
      aria-haspopup="dialog"
    >
      {className === "estate-nav-cta" ? (
        <>
          <span className="estate-nav-label">{label}</span>
          <span className="estate-nav-short-label" aria-hidden="true">
            Vizionare
          </span>
        </>
      ) : (
        label
      )}
      <Icon size={17} />
    </button>
  );

  return (
    <div className="property-website website-editorial estate-website">
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
              ? "The Editorial · Previzualizare design · Proprietate demonstrativă"
              : "Previzualizarea site-ului salvat · Nu este un link public"}
          </span>
          {sample ? (
            <Link href="/panou/proprietati/noua?template=editorial">
              Folosește acest design <ArrowUpRight size={14} />
            </Link>
          ) : (
            <span>Pentru următorul tău capitol</span>
          )}
        </div>
      )}
      <main>
        <section className="estate-hero" id="home">
          <div className="estate-hero-background">
            {property.images[0] ? (
              <PropertyImage
                src={property.images[0]}
                alt={`${property.title} — vedere principală`}
                fetchPriority="high"
                sizes="100vw"
              />
            ) : (
              <div className="estate-photo-empty">
                Fotografia de copertă va apărea aici.
              </div>
            )}
          </div>
          <header
            className="estate-nav"
            ref={navigation}
            onKeyDown={(event) => {
              if (event.key === "Escape" && menuOpen) {
                setMenuOpen(false);
                menuToggle.current?.focus();
              }
            }}
          >
            <a href="#home" className="estate-wordmark">
              {profile.agency || profile.name}
            </a>
            <nav
              id="estate-property-navigation"
              className={menuOpen ? "is-open" : undefined}
              aria-label="Navigarea proprietății"
            >
              <PropertySectionLinks
                property={property}
                sample={sample}
                onNavigate={() => setMenuOpen(false)}
              />
            </nav>
            <button
              ref={menuToggle}
              type="button"
              className="estate-menu-toggle"
              aria-label={menuOpen ? "Închide meniul" : "Deschide meniul"}
              aria-expanded={menuOpen}
              aria-controls="estate-property-navigation"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? <X size={21} /> : <Menu size={21} />}
            </button>
            {viewingButton("Programează o vizionare", "estate-nav-cta")}
          </header>
          <div className="estate-hero-content">
            <h1>
              <EditableText
                field="title"
                value={property.title || "Un loc căruia să-i spui acasă."}
                onEdit={onEdit}
              />
            </h1>
            <p className="estate-location">
              <EditableText
                field="location"
                value={property.location || "Adresa proprietății tale"}
                onEdit={onEdit}
              />
            </p>
          </div>
          <div className="estate-hero-actions">
            {viewingButton("Programează o vizionare")}
          </div>
          <div className="estate-hero-bottom">
            <dl className="estate-facts">
              <div className="estate-hero-price">
                <dd>{formatPrice(property)}</dd>
                <dt>
                  {sample
                    ? "Date exemplificative"
                    : property.transaction === "rent"
                      ? "Chirie lunară"
                      : "Preț de vânzare"}
                </dt>
              </div>
              <div>
                <dd>{property.bedrooms}</dd>
                <dt>{property.bedrooms === 1 ? "dormitor" : "dormitoare"}</dt>
              </div>
              <div>
                <dd>{property.bathrooms}</dd>
                <dt>{property.bathrooms === 1 ? "baie" : "băi"}</dt>
              </div>
              <div className="estate-hero-area">
                <dd>
                  {property.area.toLocaleString("ro-RO")} {unit}
                </dd>
                <dt>Suprafață locuibilă</dt>
              </div>
            </dl>
            {property.images.length > 0 && (
              <button
                type="button"
                className="estate-photo-count"
                aria-haspopup="dialog"
                onClick={() => setLightbox(0)}
              >
                Vezi fotografiile
              </button>
            )}
          </div>
        </section>
        <section className="estate-story estate-pad estate-space" id="story">
          <div>
            <h2 className="presentation-section-heading">
              {presentationCopy.introduction.title}
              <br />
              <em>{presentationCopy.introduction.accent}</em>
            </h2>
          </div>
          <div className="estate-story-copy">
            <p>
              <EditableText
                field="copy.introBody"
                value={copy.introBody}
                onEdit={onEdit}
              />
            </p>
          </div>
        </section>
        <ScrollGallery
          images={property.images.slice(0, SCROLL_GALLERY_CAPTIONS.length)}
          title={property.title}
        />
        <section className="estate-details estate-pad estate-space" id="details">
          <div className="estate-details-photo">
            {property.images[1] || property.images[0] ? (
              <>
                <PropertyImage
                  src={property.images[1] || property.images[0]}
                  alt={`${property.title} — o privire mai atentă`}
                  loading="lazy"
                />
                <button
                  type="button"
                  onClick={() => setLightbox(property.images[1] ? 1 : 0)}
                >
                  CU UN PAS MAI APROAPE DE ACASĂ <Expand size={15} />
                </button>
              </>
            ) : (
              <div className="estate-photo-empty">
                Adaugă fotografiile proprietății.
              </div>
            )}
          </div>
          <div className="estate-details-copy">
            <h2>
              <EditableText
                field="copy.storyTitle"
                value={copy.storyTitle}
                onEdit={onEdit}
              />
              <br />
              <em>
                <EditableText
                  field="copy.storyAccent"
                  value={copy.storyAccent}
                  onEdit={onEdit}
                />
              </em>
            </h2>
            <p>
              <EditableText
                field="copy.storyBody"
                value={copy.storyBody}
                onEdit={onEdit}
              />
            </p>
            <dl className="estate-specifications">
              <div>
                <dt>Tipul proprietății</dt>
                <dd>{propertyTypeLabel(property.type)}</dd>
              </div>
              {property.construction_year != null && (
                <div>
                  <dt>Anul de construcție</dt>
                  <dd>{property.construction_year}</dd>
                </div>
              )}
              <div>
                <dt>
                  {property.type === "Land"
                    ? "Suprafață teren"
                    : "Suprafață utilă"}
                </dt>
                <dd>
                  {property.area.toLocaleString("ro-RO")} {unit}
                </dd>
              </div>
              {extraDetail && (
                <div>
                  <dt>{extraDetail.label}</dt>
                  <dd>{extraDetail.value}</dd>
                </div>
              )}
              <div>
                <dt>Dormitoare</dt>
                <dd>{property.bedrooms}</dd>
              </div>
              <div>
                <dt>Băi</dt>
                <dd>{property.bathrooms}</dd>
              </div>
              <div>
                <dt>Adresă</dt>
                <dd>{property.location || "—"}</dd>
              </div>
              <div>
                <dt>
                  {property.transaction === "rent"
                    ? "Chirie lunară"
                    : "Preț solicitat"}
                </dt>
                <dd>{formatPrice(property)}</dd>
              </div>
            </dl>
            {property.amenities.length > 0 && (
              <ul
                className="estate-amenities"
                aria-label="Dotările proprietății"
              >
                {property.amenities.map((amenity) => (
                  <li key={amenity}>
                    <span className="estate-amenity-mark" aria-hidden="true">
                      <Check size={14} />
                    </span>
                    <span>{amenity}</span>
                  </li>
                ))}
              </ul>
            )}
            {viewingButton("Descoperă proprietatea la o vizionare")}
          </div>
        </section>
        <section
          className="estate-gallery estate-pad estate-space"
          id="gallery"
        >
          <div className="estate-section-heading">
            <div>
              <h2 className="presentation-section-heading">
                {presentationCopy.gallery.title}
                <br />
                <em>{presentationCopy.gallery.accent}</em>
              </h2>
            </div>
            <p>Descoperă fotografiile acestei locuințe.</p>
          </div>
          <div className="estate-gallery-grid">
            {property.images.map((image, index) => (
              <button
                key={`${image}-${index}`}
                type="button"
                aria-label={`Mărește fotografia proprietății ${index + 1}`}
                onClick={() => setLightbox(index)}
              >
                <PropertyImage
                  src={image}
                  alt={`${property.title} — fotografia ${index + 1}`}
                  loading="lazy"
                />
                <span>
                  <Expand size={17} />
                </span>
              </button>
            ))}
          </div>
          {!property.images.length && (
            <p className="estate-gallery-empty">
              Fotografiile proprietății vor apărea aici.
            </p>
          )}
        </section>
        {showFilm && (
          <section
            className="estate-film estate-pad"
            id="film"
            aria-labelledby="film-title"
          >
            <div className="estate-section-heading">
              <div>
                <h2 id="film-title">
                  Videoclip <em>de prezentare</em>
                </h2>
              </div>
              <p>
                Un alt fel de a descoperi locuința.
                <br />
                Mai aproape de o vizită.
              </p>
            </div>
            {film?.src && videoPanel}
            {film?.src ? (
              <video
                controlsList="nodownload"
                onContextMenu={(event) => event.preventDefault()}
                className="estate-film-player"
                controls
                playsInline
                preload="metadata"
                poster={film.poster || property.images[0]}
                aria-label={`${property.title} — filmul proprietății`}
              >
                <source src={film.src} />
                {film.captions && (
                  <track
                    default
                    kind="captions"
                    src={film.captions}
                    srcLang="en"
                    label="Engleză"
                  />
                )}
                Browserul tău nu poate reda acest videoclip.
              </video>
            ) : videoPanel ? (
              videoPanel
            ) : (
              <div className="estate-film-preview">
                {property.images[1] || property.images[0] ? (
                  <PropertyImage
                    src={property.images[1] || property.images[0]}
                    alt=""
                    loading="lazy"
                  />
                ) : null}
                <div>
                  <Film size={30} strokeWidth={1} />
                  <span>PROPRIETATEA TA PRINDE VIAȚĂ</span>
                  <h3>
                    O poveste care merită <em>văzută.</em>
                  </h3>
                  <p>Filmul proprietății va apărea aici când este gata.</p>
                  <small>
                    Previzualizarea secțiunii video · Nu a fost generat încă
                    niciun film
                  </small>
                </div>
                <span className="estate-film-mark">FILMUL PROPRIETĂȚII</span>
              </div>
            )}
          </section>
        )}
        <PropertyNeighbourhood property={property} sample={sample} />
        <PropertyMortgage property={property} />
        <section
          className="estate-contact estate-pad estate-space"
          id="contact"
        >
          <div className="estate-agent landing-agent">
            <span className="estate-eyebrow presentation-agent-kicker">
              {presentationCopy.agent.subtitle}
            </span>
            <h2 className="presentation-agent-heading">
              {presentationCopy.agent.editorialTitle}
            </h2>
            <div className="estate-agent-person landing-agent-profile">
              <span className="estate-agent-monogram">
                <AgentAvatar profile={profile} />
              </span>
              <div>
                <strong>{profile.name || "Agentul tău"}</strong>
                {profile.agency && <span>{profile.agency}</span>}
              </div>
            </div>
            {profile.bio && <p className="estate-agent-bio">{profile.bio}</p>}
            <div className="estate-agent-links">
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
              <PropertyWhatsAppLink
                phone={profile.phone}
                location={property.location}
              />
            </div>
            {viewingButton(
              "Să alegem o zi pentru vizionare",
              "estate-text-link",
              CalendarDays,
            )}
          </div>
          <form className="estate-inquiry" onSubmit={submit}>
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
                minLength={2}
                maxLength={100}
                placeholder="Numele și prenumele tău"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <div className="estate-field-pair">
              <label>
                Adresă de e-mail
                <input
                  required
                  type="email"
                  name="email"
                  autoComplete="email"
                  maxLength={254}
                  placeholder="nume@email.ro"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </label>
              <label>
                Telefon <span>(opțional)</span>
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
            <button
              type="submit"
              className="estate-button"
              disabled={busy || sent}
            >
              {busy
                ? "Se trimite…"
                : sent
                  ? "Mesaj primit"
                  : isPreview
                    ? "Încearcă formularul de contact"
                    : "Trimite un mesaj"}
              {sent ? <Check size={17} /> : <ArrowUpRight size={17} />}
            </button>
            <small>
              Prin trimitere, ești de acord să fii contactat de{" "}
              {profile.name || "agent"} în legătură cu această proprietate.
            </small>
            {isPreview && (
              <small>
                Doar previzualizare. Acest formular nu trimite mesaje.
              </small>
            )}
            {status && (
              <p className="estate-form-status" role="status">
                {status}
              </p>
            )}
          </form>
        </section>
        <section className="estate-invitation estate-pad">
          {property.images[0] && (
            <PropertyImage
              className="estate-invitation-image"
              src={property.images[0]}
              alt=""
              loading="lazy"
            />
          )}
          <div className="estate-invitation-content">
            <span className="estate-eyebrow">
              {presentationCopy.invitation.eyebrow}
            </span>
            <h2 className="presentation-invitation-heading">
              {presentationCopy.invitation.title}
              <br />
              <em>{presentationCopy.invitation.accent}</em>
            </h2>
            <p className="estate-invitation-copy">
              {propertyInvitation(property.location)}
            </p>
            {viewingButton("Programează o vizionare privată")}
            <span className="estate-invitation-note">
              <CalendarDays size={15} />
              {presentationCopy.invitation.note}
            </span>
            <p className="estate-invitation-price">{formatPrice(property)}</p>
          </div>
        </section>
      </main>
      <footer className="estate-footer estate-pad property-footer">
        <div className="footer-identity">
          <FooterIdentityLogo />
          <div className="footer-agent-details">
            <a href="#home">{profile.agency || profile.name}</a>
          </div>
        </div>
        <FooterBrand />
      </footer>
      <PropertyMobileContact
        phone={profile.phone}
        location={property.location}
        profileRole={profile.profile_role}
      />
      {viewing && (
        <ViewingDialog
          slug={property.slug}
          agentName={profile.name}
          preview={isPreview}
          onClose={() => setViewing(false)}
        />
      )}
      {lightbox !== null && (
        <PropertyPhotoDialog
          images={property.images}
          title={property.title}
          initial={lightbox}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}
