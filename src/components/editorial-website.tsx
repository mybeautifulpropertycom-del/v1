"use client";
import { propertyTypeLabel } from "@/lib/model";
import { PropertyMortgage } from "./property-mortgage";
import { PropertyNeighbourhood } from "./property-neighbourhood";
import { PropertyImage } from "./property-image";
import { AgentAvatar } from "./agent-avatar";
import { FooterBrand, FooterIdentityLogo } from "./footer-brand";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUpRight,
  Bath,
  BedDouble,
  CalendarDays,
  Check,
  Expand,
  Film,
  Mail,
  MapPin,
  Phone,
  Square,
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
  const [scrollState, setScrollState] = useState<{
    pinned: boolean | null;
    active: number;
  }>({ pinned: null, active: 0 });

  useEffect(() => {
    const root = stage.current;
    if (!root) return;
    const media = matchMedia("(prefers-reduced-motion: no-preference)");
    let frame = 0;
    function update() {
      frame = 0;
      if (!root) return;
      const pinned = media.matches && images.length > 1;
      let active = 0;
      if (pinned) {
        const step = window.innerHeight * 0.85;
        const distance = step * (images.length - 1);
        root.style.height = `${window.innerHeight + distance}px`;
        const offset = Math.max(
          0,
          Math.min(distance, -root.getBoundingClientRect().top),
        );
        active = Math.min(images.length - 1, Math.round(offset / step));
      } else root.style.removeProperty("height");
      setScrollState((current) =>
        current.pinned === pinned && current.active === active
          ? current
          : { pinned, active },
      );
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(update);
    }
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    media.addEventListener("change", schedule);
    update();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      media.removeEventListener("change", schedule);
      root.style.removeProperty("height");
    };
  }, [images.length]);

  if (!images.length) return null;
  return (
    <section
      className="estate-scroll-gallery"
      aria-labelledby="scroll-gallery-title"
    >
      <div className="estate-scroll-heading estate-pad">
        <div>
          <span className="estate-eyebrow">
            O locuință, descoperită pas cu pas
          </span>
          <h2 id="scroll-gallery-title">
            Lasă curiozitatea
            <br />
            <em>să te îndrume.</em>
          </h2>
        </div>
        <div>
          <p>
            Unele detalii merită descoperite în tihnă.
            <br />
            Mai rămâi puțin. Descoperă fiecare detaliu.
          </p>
        </div>
      </div>
      <div
        className="estate-scroll-stage"
        ref={stage}
        data-pinned={scrollState.pinned ? "true" : undefined}
      >
        <div className="estate-scroll-sticky">
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
                  className={`estate-scene ${scrollState.active === index ? "is-active" : ""}`}
                  aria-hidden={
                    scrollState.pinned && scrollState.active !== index
                      ? true
                      : undefined
                  }
                >
                  {(scrollState.pinned === false ||
                    Math.abs(index - scrollState.active) <= 1) && (
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
  previewBackLink,
}: PropertyWebsiteProps) {
  const [viewing, setViewing] = useState(false);
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
  const showFilm = Boolean(film?.src) || isPreview;
  const copy = propertyStory(property);
  const unit = property.area_unit === "sqm" ? "m²" : "sq ft";

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

  const viewingButton = (label: string, className = "estate-button") => (
    <button
      type="button"
      className={className}
      onClick={() => setViewing(true)}
      aria-haspopup="dialog"
    >
      {label}
      <ArrowUpRight size={17} />
    </button>
  );

  return (
    <div className="property-website website-editorial estate-website">
      {isPreview && (
        <div className="preview-bar">
          <Link
            href={
              previewBackLink?.href ||
              (sample
                ? "/panou/modele"
                : `/panou/proprietati/${property.id}`)
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
          <header className="estate-nav estate-pad">
            <a href="#home" className="estate-wordmark">
              {profile.agency || profile.name}
              <span>UN DRUM MAI PERSONAL SPRE ACASĂ</span>
            </a>
            <nav aria-label="Navigarea proprietății">
              <a href="#story">Locuința</a>
              <a href="#gallery">Galerie</a>
              <a href="#contact">Agentul tău</a>
            </nav>
            {viewingButton("Programează o vizionare", "estate-nav-cta")}
          </header>
          <div className="estate-hero-content estate-pad">
            <span className="estate-eyebrow">
              <span className="estate-dot" />
              {propertyTypeLabel(property.type)} ·{" "}
              {property.transaction === "sale" ? "De vânzare" : "De închiriat"}
            </span>
            <h1>
              <EditableText
                field="title"
                value={property.title || "Un loc căruia să-i spui acasă."}
                onEdit={onEdit}
              />
            </h1>
            <p>
              Unele locuri le vizitezi.
              <br />
              <em>Altora le spui acasă.</em>
            </p>
            <div className="estate-hero-actions">
              {viewingButton("Descoperă următorul capitol")}
              <a href="#gallery" className="estate-text-link">
                Descoperă locuința <ArrowDown size={16} />
              </a>
            </div>
          </div>
          <div className="estate-hero-bottom estate-pad">
            <span className="estate-location">
              <MapPin size={14} />
              <EditableText
                field="location"
                value={property.location || "Adresa proprietății tale"}
                onEdit={onEdit}
              />
            </span>
            {property.images.length > 0 && (
              <button
                type="button"
                className="estate-photo-count"
                onClick={() => setLightbox(0)}
              >
                <Expand size={16} />
                Vezi toate cele {property.images.length} fotografii
              </button>
            )}
          </div>
        </section>
        <section className="estate-story estate-pad estate-space" id="story">
          <div>
            <h2>
              <EditableText
                field="copy.introTitle"
                value={copy.introTitle}
                onEdit={onEdit}
              />
              <br />
              <em>
                <EditableText
                  field="copy.introAccent"
                  value={copy.introAccent}
                  onEdit={onEdit}
                />
              </em>
            </h2>
          </div>
          <div className="estate-story-copy">
            <p>
              <EditableText
                field="copy.introBody"
                value={
                  copy.introBody ||
                  "Spune povestea proprietății. Adaugă o descriere în editor pentru a da viață acestui spațiu."
                }
                onEdit={onEdit}
              />
            </p>
          </div>
          <dl className="estate-facts">
            <div>
              <dt>
                <Square size={16} />
                Suprafață locuibilă
              </dt>
              <dd>
                {property.area.toLocaleString("ro-RO")} <small>{unit}</small>
              </dd>
            </div>
            <div>
              <dt>
                <BedDouble size={17} />
                Dormitoare
              </dt>
              <dd>{property.bedrooms.toString().padStart(2, "0")}</dd>
            </div>
            <div>
              <dt>
                <Bath size={17} />
                Băi
              </dt>
              <dd>{property.bathrooms.toString().padStart(2, "0")}</dd>
            </div>
            <div>
              <dt>
                {property.transaction === "rent" ? "Chirie lunară" : "Preț"}
              </dt>
              <dd>{formatPrice(property)}</dd>
            </div>
          </dl>
        </section>
        <ScrollGallery
          images={property.images.slice(0, SCROLL_GALLERY_CAPTIONS.length)}
          title={property.title}
        />
        <section className="estate-details estate-pad estate-space">
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
                <dt>Suprafață locuibilă</dt>
                <dd>
                  {property.area.toLocaleString("ro-RO")} {unit}
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
                <dd>{propertyTypeLabel(property.type)}</dd>
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
              <h2>
                <EditableText
                  field="copy.galleryTitle"
                  value={copy.galleryTitle}
                  onEdit={onEdit}
                />
                <br />
                <em>
                  <EditableText
                    field="copy.galleryAccent"
                    value={copy.galleryAccent}
                    onEdit={onEdit}
                  />
                </em>
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
                  Înainte să pășești <em>înăuntru.</em>
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
            <h2>
              Hai să discutăm.
              <br />
              <em>Simte-te acasă.</em>
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
            </div>
            {viewingButton(
              "Să alegem o zi pentru vizionare",
              "estate-text-link",
            )}
          </div>
          <form className="estate-inquiry" onSubmit={submit}>
            <span className="estate-eyebrow">
              Fiecare început pornește cu un salut
            </span>
            <h3>
              Hai să ne <em>cunoaștem.</em>
            </h3>
            <p>Ai o întrebare sau vrei mai multe detalii? Scrie-ne.</p>
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
                  placeholder="you@example.com"
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
              Următorul tău capitol te așteaptă
            </span>
            <h2>
              <EditableText
                field="copy.closingTitle"
                value={copy.closingTitle}
                onEdit={onEdit}
              />
              <br />
              <em>
                <EditableText
                  field="copy.closingAccent"
                  value={copy.closingAccent}
                  onEdit={onEdit}
                />
              </em>
            </h2>
            <p className="estate-invitation-copy">
              <EditableText
                field="copy.closingBody"
                value={copy.closingBody}
                onEdit={onEdit}
              />
            </p>
            {viewingButton("Programează o vizionare privată")}
            <span className="estate-invitation-note">
              <CalendarDays size={15} />O zi potrivită pentru tine. O locuință
              în care să te simți acasă.
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
            <span>{property.location}</span>
          </div>
        </div>
        <FooterBrand />
      </footer>
      {viewing && (
        <ViewingDialog
          title={property.title}
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
