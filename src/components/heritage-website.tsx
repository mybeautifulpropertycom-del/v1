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
  ArrowUpRight,
  Asterisk,
  Film,
  Mail,
  Phone,
  Plus,
} from "lucide-react";
import { formatPrice, safePhone } from "@/lib/model";
import { propertyStory } from "@/lib/property-story";
import type { PropertyWebsiteProps } from "./property-website";
import { EditableText } from "./website-editable-text";
import { PropertyPhotoDialog } from "./property-photo-dialog";
import { ViewingDialog } from "./viewing-dialog";
import { HeritageContactForm } from "./heritage-contact-form";

export function HeritageWebsite({
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
      sample
        ? "Preț exemplificativ"
        : property.transaction === "rent"
          ? "Chirie lunară"
          : "Preț de vânzare",
    ],
    [
      String(property.bedrooms),
      property.bedrooms === 1 ? "dormitor" : "dormitoare",
    ],
    [String(property.bathrooms), property.bathrooms === 1 ? "baie" : "băi"],
    [size, "Suprafață locuibilă"],
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
              (sample ? "/panou/modele" : `/panou/proprietati/${property.id}`)
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
          {sample && (
            <Link href="/panou/proprietati/noua?template=minimal">
              Folosește acest design <ArrowUpRight size={14} />
            </Link>
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
          aria-label="Prezentarea proprietății"
        >
          <div className="heritage-hero">
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
            {property.images.length > 0 && (
              <button
                type="button"
                className="heritage-hero-photos"
                aria-haspopup="dialog"
                onClick={() => setLightbox(0)}
              >
                {property.images.length === 1
                  ? "Vezi fotografia"
                  : `Vezi cele ${property.images.length} fotografii`}
                <ArrowUpRight size={16} />
              </button>
            )}
            <div className="heritage-hero-copy">
              <h1>
                <EditableText
                  field="title"
                  value={property.title || "Un plus de personalitate."}
                  onEdit={onEdit}
                />
              </h1>
              <p className="heritage-hero-address">
                <EditableText
                  field="location"
                  value={property.location || "Adresa proprietății tale"}
                  onEdit={onEdit}
                />
              </p>
            </div>
          </div>
          <div className="heritage-hero-summary">
            <dl className="heritage-facts">
              {facts.map(([value, label], index) => (
                <div key={label}>
                  <dd>{value}</dd>
                  <dt className={index === 3 ? "sr-only" : undefined}>
                    {label}
                  </dt>
                </div>
              ))}
            </dl>
            {tourButton("heritage-button heritage-hero-action")}
          </div>
        </section>
        <section
          className="heritage-story heritage-section heritage-pad"
          id="story"
        >
          <div className="heritage-story-layout">
            <div className="heritage-story-copy">
              <div className="heritage-story-text">
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
              </div>
            </div>
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
            <div className="heritage-story-action">
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
          <div className="heritage-section-heading">
            <h2 className="presentation-section-heading">
              {presentationCopy.gallery.title}
              <br />
              <em>{presentationCopy.gallery.accent}</em>
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
        </section>
        <section
          className="heritage-details heritage-section heritage-pad"
          aria-labelledby="heritage-details-title"
        >
          <div className="heritage-details-copy">
            <span className="heritage-kicker">
              {presentationCopy.heritageDetails.label}
            </span>
            <h2 id="heritage-details-title">
              {presentationCopy.heritageDetails.title}
              <br />
              <em>{presentationCopy.heritageDetails.accent}</em>
            </h2>
            <dl className="heritage-property-details">
              {[
                ["Suprafață locuibilă", size],
                ["Dormitoare", String(property.bedrooms)],
                ["Băi", String(property.bathrooms)],
                ["Tipul proprietății", propertyTypeLabel(property.type)],
                ...(property.construction_year != null
                  ? [["Anul de construcție", String(property.construction_year)]]
                  : []),
                ["Adresă", property.location || "—"],
                [
                  property.transaction === "rent"
                    ? "Chirie lunară"
                    : "Preț solicitat",
                  formatPrice(property),
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            {property.amenities.length > 0 && (
              <ul
                aria-label="Dotările proprietății"
                className={
                  property.amenities.length > 1
                    ? "heritage-features-columns"
                    : undefined
                }
              >
                {property.amenities.map((feature, index) => (
                  <li key={`${feature}-${index}`}>{feature}</li>
                ))}
              </ul>
            )}
            {tourButton()}
          </div>
          <div className="heritage-details-media">
            {detailPhoto ? (
              <button
                type="button"
                className="heritage-details-image"
                aria-label="Deschide galeria foto a proprietății"
                aria-haspopup="dialog"
                onClick={() =>
                  setLightbox(
                    property.images[2] ? 2 : property.images[1] ? 1 : 0,
                  )
                }
              >
                <PropertyImage
                  src={detailPhoto}
                  alt={`${property.title} — detaliu al proprietății`}
                  sizes="(max-width: 767px) 100vw, 40vw"
                  loading="lazy"
                />
              </button>
            ) : (
              <div className="heritage-image-empty">
                Fotografiile proprietății vor apărea aici.
              </div>
            )}
          </div>
        </section>
        {videoIncluded && (film?.src || isPreview) && (
          <section
            className="heritage-film heritage-section heritage-pad"
            id="film"
            aria-labelledby="heritage-film-title"
          >
            <div className="heritage-film-heading">
              <h2 id="heritage-film-title">
                Videoclip <em>de prezentare</em>
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
            <span className="heritage-kicker presentation-agent-kicker">
              {presentationCopy.agent.subtitle}
            </span>
            <h2
              className="presentation-agent-heading"
              id="heritage-contact-title"
            >
              {presentationCopy.agent.title}
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
                  <Phone size={18} />
                  <span>
                    <small>Telefon</small>
                    {profile.phone}
                  </span>
                  <ArrowUpRight size={17} />
                </a>
              )}
              {profile.email && (
                <a href={`mailto:${profile.email}`}>
                  <Mail size={18} />
                  <span>
                    <small>E-mail</small>
                    {profile.email}
                  </span>
                  <ArrowUpRight size={17} />
                </a>
              )}
            </div>
          </div>
          <HeritageContactForm
            slug={property.slug}
            agentName={profile.name}
            preview={isPreview}
          />
        </section>
        <section className="heritage-invitation">
          {property.images[0] && (
            <PropertyImage src={property.images[0]} alt="" loading="lazy" />
          )}
          <div>
            <span className="heritage-kicker">
              {presentationCopy.invitation.eyebrow}
            </span>
            <h2 className="presentation-invitation-heading">
              {presentationCopy.invitation.title}
              <br />
              <em>{presentationCopy.invitation.accent}</em>
            </h2>
            <p className="heritage-invitation-copy">
              {propertyInvitation(property.location)}
            </p>
            {tourButton("heritage-button heritage-button-paper")}
            <span className="heritage-invitation-note">
              {presentationCopy.invitation.note}
            </span>
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
