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
  Asterisk,
  Expand,
  Film,
  Mail,
  MapPin,
  Phone,
  Plus,
} from "lucide-react";
import { formatPrice, safePhone } from "@/lib/model";
import { propertyStory } from "@/lib/property-story";
import type { PropertyWebsiteProps } from "./property-website";
import { EditableText } from "./website-editable-text";
import { PropertyPhotoDialog } from "./property-photo-dialog";
import { ViewingDialog } from "./viewing-dialog";

/** Scroll changes only the cover photograph. Native page scrolling stays intact. */
function useCoverZoom() {
  const stage = useRef<HTMLElement>(null);
  const cover = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = stage.current;
    const frame = cover.current;
    if (!root || !frame) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const desktop = matchMedia("(min-width: 768px) and (min-height: 600px)");
    let animationFrame = 0;
    function update() {
      animationFrame = 0;
      if (!root || !frame) return;
      if (reduced.matches) {
        root.removeAttribute("data-zoom-pinned");
        root.style.removeProperty("height");
        frame.style.setProperty("--cover-scale", "1");
        return;
      }
      const distance = desktop.matches
        ? innerHeight * 0.65
        : frame.offsetHeight;
      if (desktop.matches) {
        root.dataset.zoomPinned = "true";
        root.style.height = `${frame.offsetHeight + distance}px`;
      } else {
        root.removeAttribute("data-zoom-pinned");
        root.style.removeProperty("height");
      }
      const progress = Math.max(
        0,
        Math.min(1, -root.getBoundingClientRect().top / Math.max(1, distance)),
      );
      frame.style.setProperty("--cover-scale", String(1 + progress * 0.2));
    }
    function schedule() {
      if (!animationFrame) animationFrame = requestAnimationFrame(update);
    }
    const resize = new ResizeObserver(schedule);
    resize.observe(frame);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    reduced.addEventListener("change", schedule);
    desktop.addEventListener("change", schedule);
    update();
    return () => {
      cancelAnimationFrame(animationFrame);
      resize.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      reduced.removeEventListener("change", schedule);
      desktop.removeEventListener("change", schedule);
      root.removeAttribute("data-zoom-pinned");
      root.style.removeProperty("height");
      frame.style.removeProperty("--cover-scale");
    };
  }, []);
  return { stage, cover };
}

export function HeritageWebsite({
  property,
  profile,
  preview = false,
  sample = false,
  onEdit,
  film,
  videoPanel,
  previewBackLink,
}: PropertyWebsiteProps) {
  const { stage, cover } = useCoverZoom();
  const [viewing, setViewing] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [highlights, setHighlights] = useState(false);
  const copy = propertyStory(property);
  const isPreview = preview || sample;
  const unit = property.area_unit === "sqm" ? "m²" : "sq ft";
  const size = `${property.area.toLocaleString("ro-RO")} ${unit}`;
  const photographs = property.images.map((src, index) => ({ src, index }));
  const visiblePhotographs = highlights ? photographs.slice(0, 3) : photographs;
  const secondaryPhoto = property.images[1] || property.images[0];
  const detailPhoto = property.images[2] || secondaryPhoto;
  const facts = [
    [
      formatPrice(property),
      property.transaction === "rent" ? "Chirie lunară" : "Preț",
    ],
    [String(property.bedrooms), "Dormitoare"],
    [String(property.bathrooms), "Băi"],
    [property.area.toLocaleString("ro-RO"), `${unit} suprafață locuibilă`],
    [propertyTypeLabel(property.type), "Tipul proprietății"],
  ];
  const features = property.amenities.length
    ? property.amenities
    : [
        propertyTypeLabel(property.type),
        `${property.bedrooms} dormitoare`,
        `${property.bathrooms} băi`,
        `${size} suprafață locuibilă`,
      ];
  const tourButton = (className = "heritage-button") => (
    <button
      type="button"
      className={className}
      aria-haspopup="dialog"
      onClick={() => setViewing(true)}
    >
      Programează o vizionare <ArrowUpRight size={15} />
    </button>
  );

  return (
    <div className="property-website website-minimal heritage-website">
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
              ? "The Heritage · Previzualizare design · Proprietate demonstrativă"
              : "Previzualizarea site-ului salvat · Nu este un link public"}
          </span>
          {sample ? (
            <Link href="/panou/proprietati/noua?template=minimal">
              Folosește acest design <ArrowUpRight size={14} />
            </Link>
          ) : (
            <span>Un loc pentru următorul tău capitol</span>
          )}
        </div>
      )}
      <header className="heritage-nav heritage-pad">
        <a className="heritage-wordmark" href="#home">
          <span>{profile.agency || profile.name}</span>
          <Asterisk size={21} strokeWidth={1} />
        </a>
        <nav aria-label="Navigarea proprietății">
          <a href="#story">Locuința</a>
          <a href="#gallery">Încăperile</a>
          <a href="#contact">Agentul tău</a>
        </nav>
        {tourButton("heritage-nav-tour")}
      </header>
      <main>
        <section
          className="heritage-hero-stage"
          id="home"
          ref={stage}
          aria-label="Prezentarea proprietății"
        >
          <div className="heritage-hero" ref={cover}>
            <div className="heritage-cover">
              {property.images[0] ? (
                <PropertyImage
                  className="heritage-cover-image"
                  src={property.images[0]}
                  alt={`${property.title} — vedere principală`}
                  fetchPriority="high"
                  sizes="100vw"
                />
              ) : (
                <div className="heritage-image-empty">
                  Fotografia de copertă va apărea aici.
                </div>
              )}
            </div>
            <div className="heritage-hero-copy heritage-pad">
              <span className="heritage-kicker">
                Un loc pe care să-l numești acasă ·{" "}
                {property.transaction === "rent"
                  ? "De închiriat"
                  : "De vânzare"}
              </span>
              <h1>
                <EditableText
                  field="title"
                  value={property.title || "Un plus de personalitate."}
                  onEdit={onEdit}
                />
              </h1>
              <p className="heritage-hero-intro">
                <EditableText
                  field="copy.heroIntro"
                  value={copy.heroIntro}
                  onEdit={onEdit}
                />
              </p>
              {tourButton("heritage-link heritage-hero-tour")}
            </div>
            <div className="heritage-hero-bottom heritage-pad">
              <span>
                <MapPin size={13} />
                <EditableText
                  field="location"
                  value={property.location || "Adresa proprietății tale"}
                  onEdit={onEdit}
                />
              </span>
              <a
                href="#story"
                className="heritage-hero-down"
                aria-label="Descoperă locuința"
              >
                <ArrowDown size={17} />
                <span>
                  UN NOU CAPITOL
                  <br />
                  ÎNCEPE AICI
                </span>
              </a>
              {property.images.length > 0 && (
                <button type="button" onClick={() => setLightbox(0)}>
                  <span>
                    Vezi toate cele {property.images.length} fotografii
                  </span>
                  <Expand size={13} />
                </button>
              )}
            </div>
          </div>
        </section>
        <dl className="heritage-facts heritage-pad">
          {facts.map(([value, label]) => (
            <div key={label}>
              <dd>{value}</dd>
              <dt>{label}</dt>
            </div>
          ))}
        </dl>
        <section
          className="heritage-story heritage-section heritage-pad"
          id="story"
        >
          <div className="heritage-section-label">
            <span>O LOCUINȚĂ. O EMOȚIE. UN NOU ÎNCEPUT.</span>
          </div>
          <div className="heritage-section-heading">
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
            <p>
              <EditableText
                field="copy.introBody"
                value={copy.introBody}
                onEdit={onEdit}
              />
            </p>
          </div>
          <div className="heritage-story-layout">
            <figure className="heritage-album-photo">
              {secondaryPhoto ? (
                <button
                  type="button"
                  onClick={() => setLightbox(property.images[1] ? 1 : 0)}
                  aria-label="Descoperă fotografia locuinței"
                >
                  <PropertyImage
                    src={secondaryPhoto}
                    alt={`${property.title} — o privire mai atentă`}
                    loading="lazy"
                  />
                </button>
              ) : (
                <div className="heritage-image-empty">
                  Adaugă o fotografie care să spună povestea.
                </div>
              )}
              <figcaption>{property.title}</figcaption>
              <span className="heritage-seal">
                <Asterisk size={18} strokeWidth={1} />
                <strong>Următorul tău</strong>
                <em>capitol</em>
              </span>
            </figure>
            <div className="heritage-story-copy">
              <span className="heritage-kicker">O perspectivă nouă</span>
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
                  value={
                    copy.storyBody ||
                    "Povestea proprietății va apărea aici. Adaugă o descriere în editor pentru a spune ce o face deosebită."
                  }
                  onEdit={onEdit}
                />
              </p>
              {tourButton("heritage-link")}
            </div>
          </div>
        </section>
        <div
          className="heritage-amenity-strip"
          aria-label="Punctele forte ale proprietății"
        >
          <div className="heritage-amenity-window">
            <div className="heritage-amenity-track">
              {[0, 1].map((repeat) => (
                <ul key={repeat} aria-hidden={repeat === 1 ? true : undefined}>
                  {features.map((feature, index) => (
                    <li key={`${feature}-${index}`}>{feature}</li>
                  ))}
                </ul>
              ))}
            </div>
          </div>
        </div>
        <section
          className="heritage-gallery heritage-section heritage-pad"
          id="gallery"
        >
          <div className="heritage-section-label">
            <span>FIECARE FOTOGRAFIE, O NOUĂ POSIBILITATE</span>
          </div>
          <div className="heritage-section-heading">
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
            <p>
              <EditableText
                field="copy.galleryBody"
                value={
                  copy.galleryBody ||
                  "Descoperă fotografiile. Programează o vizionare pentru a vedea detaliile la fața locului."
                }
                onEdit={onEdit}
              />
            </p>
          </div>
          <div className="heritage-gallery-tools">
            <div role="group" aria-label="Selecție de fotografii">
              <button
                type="button"
                aria-pressed={!highlights}
                onClick={() => setHighlights(false)}
              >
                Toate fotografiile
              </button>
              {photographs.length > 3 && (
                <button
                  type="button"
                  aria-pressed={highlights}
                  onClick={() => setHighlights(true)}
                >
                  Prime impresii
                </button>
              )}
            </div>
          </div>
          <div className="heritage-photo-grid">
            {visiblePhotographs.map(({ src, index }) => (
              <figure key={`${src}-${index}`}>
                <button
                  type="button"
                  onClick={() => setLightbox(index)}
                  aria-label={`Mărește fotografia proprietății ${index + 1}`}
                >
                  <PropertyImage
                    src={src}
                    alt={`${property.title} — fotografia ${index + 1}`}
                    loading="lazy"
                  />
                  <span>
                    <Plus size={17} />
                  </span>
                </button>
              </figure>
            ))}
          </div>
          {!photographs.length && (
            <div className="heritage-gallery-empty">
              Fotografiile proprietății vor apărea aici.
            </div>
          )}
          <div className="heritage-gallery-footer">
            <p>Descoperă restul la o vizionare.</p>
            {tourButton("heritage-button heritage-button-outline")}
          </div>
        </section>
        <section
          className="heritage-details"
          aria-labelledby="heritage-details-title"
        >
          <div className="heritage-details-image">
            {detailPhoto ? (
              <PropertyImage
                src={detailPhoto}
                alt={`${property.title} — detaliu al proprietății`}
                loading="lazy"
              />
            ) : (
              <div className="heritage-image-empty">
                O privire mai atentă asupra proprietății.
              </div>
            )}
            <span>DETALIILE FAC DIFERENȚA</span>
          </div>
          <div className="heritage-details-copy">
            <span className="heritage-kicker">Detalii pentru tine</span>
            <h2 id="heritage-details-title">
              <EditableText
                field="copy.detailsTitle"
                value={copy.detailsTitle}
                onEdit={onEdit}
              />
              <br />
              <em>
                <EditableText
                  field="copy.detailsAccent"
                  value={copy.detailsAccent}
                  onEdit={onEdit}
                />
              </em>
            </h2>
            <p>
              <EditableText
                field="copy.detailsBody"
                value={copy.detailsBody}
                onEdit={onEdit}
              />
            </p>
            <ul>
              {features.slice(0, 6).map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
          </div>
        </section>
        {(film?.src || isPreview) && (
          <section
            className="heritage-film heritage-section heritage-pad"
            id="film"
            aria-labelledby="heritage-film-title"
          >
            <div className="heritage-film-heading">
              <h2 id="heritage-film-title">
                Imaginează-ți <em>următorul capitol.</em>
              </h2>
              <span className="heritage-kicker">LOCUINȚA PRINDE VIAȚĂ</span>
            </div>
            {film?.src && videoPanel}
            {film?.src ? (
              <>
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
                      default
                      kind="captions"
                      src={film.captions}
                      srcLang="en"
                      label="Engleză"
                    />
                  )}
                  Browserul tău nu poate reda acest videoclip.
                </video>
              </>
            ) : videoPanel ? (
              videoPanel
            ) : (
              <div className="heritage-film-preview">
                {property.images[0] && (
                  <PropertyImage
                    src={property.images[0]}
                    alt=""
                    loading="lazy"
                  />
                )}
                <div>
                  <span className="heritage-kicker">Aici începe o poveste</span>
                  <Film size={28} strokeWidth={1} />
                  <p>Filmul proprietății va apărea aici când este gata.</p>
                  <small>
                    Previzualizarea secțiunii video · Nu a fost generat încă
                    niciun film
                  </small>
                </div>
              </div>
            )}
          </section>
        )}
        <PropertyNeighbourhood property={property} sample={sample} />
        <PropertyMortgage property={property} />
        <section
          className="heritage-contact heritage-pad"
          id="contact"
          aria-labelledby="heritage-contact-title"
        >
          <div className="heritage-agent landing-agent">
            <span className="heritage-kicker">
              Omul din spatele proprietății
            </span>
            <h2 id="heritage-contact-title">
              O scurtă <em>prezentare.</em>
            </h2>
            <div className="heritage-agent-profile landing-agent-profile">
              <span className="heritage-agent-monogram">
                <AgentAvatar profile={profile} />
              </span>
              <div>
                <strong>{profile.name || "Agentul tău"}</strong>
                {profile.agency && <span>{profile.agency}</span>}
              </div>
            </div>
            {profile.bio && <p>{profile.bio}</p>}
            <div className="heritage-agent-links">
              {profile.phone && (
                <a href={`tel:${safePhone(profile.phone)}`}>
                  <Phone size={15} />
                  {profile.phone}
                </a>
              )}
              {profile.email && (
                <a href={`mailto:${profile.email}`}>
                  <Mail size={15} />
                  {profile.email}
                </a>
              )}
            </div>
          </div>
          <div className="heritage-contact-note">
            <Asterisk size={32} strokeWidth={1} />
            <h3>
              Să alegem o zi
              <br />
              <em>pentru vizionare.</em>
            </h3>
            <p>
              Alege ziua preferată și lasă datele de contact.
              <br />
              {profile.name || "Agentul tău"} va confirma ora și
              disponibilitatea.
            </p>
            {tourButton()}
          </div>
        </section>
        <section
          className="heritage-setting heritage-section heritage-pad"
          id="setting"
        >
          <div className="heritage-setting-layout">
            <div>
              <span className="heritage-kicker">FĂ LOC PENTRU CE URMEAZĂ</span>
              <h2>
                <EditableText
                  field="copy.settingTitle"
                  value={copy.settingTitle}
                  onEdit={onEdit}
                />
                <br />
                <em>
                  <EditableText
                    field="copy.settingAccent"
                    value={copy.settingAccent}
                    onEdit={onEdit}
                  />
                </em>
              </h2>
              <p>
                <EditableText
                  field="copy.settingBody"
                  value={copy.settingBody}
                  onEdit={onEdit}
                />
              </p>
              <dl>
                <div>
                  <dt>
                    {property.transaction === "rent" ? "Chirie lunară" : "Preț"}
                  </dt>
                  <dd>{formatPrice(property)}</dd>
                </div>
                <div>
                  <dt>Suprafață locuibilă</dt>
                  <dd>{size}</dd>
                </div>
                <div>
                  <dt>Număr de dormitoare</dt>
                  <dd>{property.bedrooms}</dd>
                </div>
                <div>
                  <dt>Număr de băi</dt>
                  <dd>{property.bathrooms}</dd>
                </div>
              </dl>
              {tourButton("heritage-link")}
            </div>
            <figure>
              {property.images[0] ? (
                <PropertyImage
                  src={property.images[0]}
                  alt={`${property.title} — proprietatea`}
                  loading="lazy"
                />
              ) : (
                <div className="heritage-image-empty">
                  Fotografia proprietății va apărea aici.
                </div>
              )}
              <figcaption>
                <MapPin size={18} />
                <span>
                  {property.location || "Adresa proprietății tale"}
                  <small>UN LOC PENTRU URMĂTORUL TĂU CAPITOL</small>
                </span>
              </figcaption>
            </figure>
          </div>
        </section>
        <section className="heritage-invitation">
          {property.images[0] && (
            <PropertyImage src={property.images[0]} alt="" loading="lazy" />
          )}
          <div>
            <span className="heritage-kicker">
              Unele lucruri merită văzute personal
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
            {copy.closingBody && (
              <p className="heritage-invitation-copy">
                <EditableText
                  field="copy.closingBody"
                  value={copy.closingBody}
                  onEdit={onEdit}
                />
              </p>
            )}
            {tourButton("heritage-button heritage-button-paper")}
          </div>
        </section>
      </main>
      <footer className="heritage-footer heritage-pad property-footer">
        <a href="#home" className="footer-identity">
          <FooterIdentityLogo />
          <span className="footer-agent-details">
            <span>{profile.agency || profile.name}</span>
            <span className="footer-mobile-address">{property.location}</span>
          </span>
          <Asterisk size={18} strokeWidth={1} />
        </a>
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
