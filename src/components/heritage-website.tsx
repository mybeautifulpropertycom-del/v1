"use client";

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
}: PropertyWebsiteProps) {
  const { stage, cover } = useCoverZoom();
  const [viewing, setViewing] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [highlights, setHighlights] = useState(false);
  const [amenitiesPaused, setAmenitiesPaused] = useState(false);
  const copy = propertyStory(property);
  const isPreview = preview || sample;
  const unit = property.area_unit === "sqm" ? "m²" : "sq ft";
  const size = `${property.area.toLocaleString("en-US")} ${unit}`;
  const photographs = property.images.map((src, index) => ({ src, index }));
  const visiblePhotographs = highlights ? photographs.slice(0, 3) : photographs;
  const secondaryPhoto = property.images[1] || property.images[0];
  const detailPhoto = property.images[2] || secondaryPhoto;
  const facts = [
    [
      formatPrice(property),
      property.transaction === "rent" ? "Monthly rent" : "Offered at",
    ],
    [String(property.bedrooms), "Bedrooms"],
    [String(property.bathrooms), "Bathrooms"],
    [property.area.toLocaleString("en-US"), `${unit} of living space`],
    [property.type, "Property type"],
  ];
  const features = property.amenities.length
    ? property.amenities
    : [
        property.type,
        `${property.bedrooms} bedrooms`,
        `${property.bathrooms} bathrooms`,
        `${size} of living space`,
      ];
  const initials = profile.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
  const tourButton = (className = "heritage-button") => (
    <button
      type="button"
      className={className}
      aria-haspopup="dialog"
      onClick={() => setViewing(true)}
    >
      Schedule a tour <ArrowUpRight size={15} />
    </button>
  );

  return (
    <div className="property-website website-minimal heritage-website">
      {isPreview && (
        <div className="preview-bar">
          <Link
            href={
              sample
                ? "/dashboard/templates"
                : `/dashboard/properties/${property.id}`
            }
          >
            <ArrowLeft size={15} />
            {sample ? "Back to collection" : "Back to editor"}
          </Link>
          <span>
            {sample
              ? "The Heritage · Design preview · Sample property"
              : "Saved website preview · Not a public link"}
          </span>
          {sample ? (
            <Link href="/dashboard/properties/new?template=minimal">
              Use this design <ArrowUpRight size={14} />
            </Link>
          ) : (
            <span>A place for your next chapter</span>
          )}
        </div>
      )}
      <header className="heritage-nav heritage-pad">
        <a className="heritage-wordmark" href="#home">
          <span>{profile.agency || profile.name}</span>
          <Asterisk size={21} strokeWidth={1} />
        </a>
        <nav aria-label="Property navigation">
          <a href="#story">The home</a>
          <a href="#gallery">The rooms</a>
          <a href="#contact">Your agent</a>
        </nav>
        {tourButton("heritage-nav-tour")}
      </header>
      <main>
        <section
          className="heritage-hero-stage"
          id="home"
          ref={stage}
          aria-label="Property introduction"
        >
          <div className="heritage-hero" ref={cover}>
            <div className="heritage-cover">
              {property.images[0] ? (
                <img
                  className="heritage-cover-image"
                  src={property.images[0]}
                  alt={`${property.title} — main view`}
                  fetchPriority="high"
                />
              ) : (
                <div className="heritage-image-empty">
                  Your cover photograph will appear here.
                </div>
              )}
            </div>
            <div className="heritage-hero-copy heritage-pad">
              <span className="heritage-kicker">
                A place to make your own ·{" "}
                {property.transaction === "rent" ? "For rent" : "For sale"}
              </span>
              <h1>
                <EditableText
                  field="title"
                  value={property.title || "A little character."}
                  onEdit={onEdit}
                />
              </h1>
              <p className="heritage-hero-script">
                <EditableText
                  field="copy.heroLine"
                  value={copy.heroLine}
                  onEdit={onEdit}
                />
              </p>
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
                  value={property.location || "Your property location"}
                  onEdit={onEdit}
                />
              </span>
              <a
                href="#story"
                className="heritage-hero-down"
                aria-label="Discover the home"
              >
                <ArrowDown size={17} />
                <span>
                  A NEW CHAPTER
                  <br />
                  BEGINS HERE
                </span>
              </a>
              {property.images.length > 0 && (
                <button type="button" onClick={() => setLightbox(0)}>
                  <span>View all {property.images.length} photos</span>
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
            <span>
              <Plus size={13} />
              The introduction
            </span>
            <span>A HOME. A FEELING. A FRESH START.</span>
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
                  aria-label="Explore the home photograph"
                >
                  <img
                    src={secondaryPhoto}
                    alt={`${property.title} — a closer perspective`}
                    loading="lazy"
                  />
                </button>
              ) : (
                <div className="heritage-image-empty">
                  Add a photograph to tell your story.
                </div>
              )}
              <figcaption>
                {copy.captions[property.images[1] ? 1 : 0] || property.title}
              </figcaption>
              <span className="heritage-seal">
                <Asterisk size={18} strokeWidth={1} />
                <strong>Your next</strong>
                <em>chapter</em>
              </span>
            </figure>
            <div className="heritage-story-copy">
              <span className="heritage-kicker">A fresh perspective</span>
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
                    "Your property’s story will appear here. Add a description in the editor to share what makes it special."
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
          aria-label="Property highlights"
          data-paused={amenitiesPaused}
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
          <button
            type="button"
            aria-pressed={amenitiesPaused}
            onClick={() => setAmenitiesPaused((paused) => !paused)}
          >
            {amenitiesPaused ? "Resume highlights" : "Pause highlights"}
          </button>
        </div>
        <section
          className="heritage-gallery heritage-section heritage-pad"
          id="gallery"
        >
          <div className="heritage-section-label">
            <span>
              <Plus size={13} />A closer look
            </span>
            <span>EVERY PICTURE, ANOTHER POSSIBILITY</span>
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
                  "Take a look around. Arrange a tour to see the details in person."
                }
                onEdit={onEdit}
              />
            </p>
          </div>
          <div className="heritage-gallery-tools">
            <div role="group" aria-label="Photograph selection">
              <button
                type="button"
                aria-pressed={!highlights}
                onClick={() => setHighlights(false)}
              >
                All photographs
              </button>
              {photographs.length > 3 && (
                <button
                  type="button"
                  aria-pressed={highlights}
                  onClick={() => setHighlights(true)}
                >
                  First impressions
                </button>
              )}
            </div>
            <span>
              {visiblePhotographs.length} / {photographs.length} PHOTOGRAPHS
            </span>
          </div>
          <div className="heritage-photo-grid">
            {visiblePhotographs.map(({ src, index }) => (
              <figure key={`${src}-${index}`}>
                <button
                  type="button"
                  onClick={() => setLightbox(index)}
                  aria-label={`Enlarge property photo ${index + 1}`}
                >
                  <img
                    src={src}
                    alt={`${property.title} — view ${index + 1}`}
                    loading="lazy"
                  />
                  <span>
                    <Plus size={17} />
                  </span>
                </button>
                <figcaption>
                  <span>{String(index + 1).padStart(2, "0")}.</span>
                  {copy.captions[index]}
                </figcaption>
              </figure>
            ))}
          </div>
          {!photographs.length && (
            <div className="heritage-gallery-empty">
              Your property photographs will appear here.
            </div>
          )}
          <div className="heritage-gallery-footer">
            <p>
              Good photographs. Real possibilities.
              <br />
              See the rest in person.
            </p>
            {tourButton("heritage-button heritage-button-outline")}
          </div>
        </section>
        <section
          className="heritage-details"
          aria-labelledby="heritage-details-title"
        >
          <div className="heritage-details-image">
            {detailPhoto ? (
              <img
                src={detailPhoto}
                alt={`${property.title} — property detail`}
                loading="lazy"
              />
            ) : (
              <div className="heritage-image-empty">
                A closer look at your property.
              </div>
            )}
            <span>THE DETAILS MAKE THE DIFFERENCE</span>
          </div>
          <div className="heritage-details-copy">
            <span className="heritage-kicker">Thoughtfully yours</span>
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
            <div className="heritage-section-label">
              <span>
                <Plus size={13} />
                Picture yourself here
              </span>
              <span>THE HOME, IN MOTION</span>
            </div>
            {film?.src ? (
              <>
                <h2 id="heritage-film-title" className="heritage-film-title">
                  Picture your <em>next chapter.</em>
                </h2>
                <video
                  controls
                  playsInline
                  preload="metadata"
                  poster={film.poster || property.images[0]}
                  aria-label={`${property.title} — property film`}
                >
                  <source src={film.src} />
                  {film.captions && (
                    <track
                      default
                      kind="captions"
                      src={film.captions}
                      srcLang="en"
                      label="English"
                    />
                  )}
                  Your browser does not support this video.{" "}
                  <a href={film.src}>Open the property film</a>.
                </video>
              </>
            ) : (
              <div className="heritage-film-preview">
                {property.images[0] && (
                  <img src={property.images[0]} alt="" loading="lazy" />
                )}
                <div>
                  <span className="heritage-kicker">There’s a story here</span>
                  <h2 id="heritage-film-title">
                    Picture your
                    <br />
                    <em>next chapter.</em>
                  </h2>
                  <Film size={28} strokeWidth={1} />
                  <p>Your completed property film will appear here.</p>
                  <small>
                    Video layout preview · No film has been generated yet
                  </small>
                </div>
              </div>
            )}
          </section>
        )}
        <section
          className="heritage-contact heritage-pad"
          id="contact"
          aria-labelledby="heritage-contact-title"
        >
          <div className="heritage-agent landing-agent">
            <span className="heritage-kicker">
              The person behind the property
            </span>
            <h2 id="heritage-contact-title">
              A personal <em>introduction.</em>
            </h2>
            <div className="heritage-agent-profile landing-agent-profile">
              <span className="heritage-agent-monogram">{initials || "—"}</span>
              <div>
                <strong>{profile.name || "Your agent"}</strong>
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
              Let’s find a day
              <br />
              <em>to meet.</em>
            </h3>
            <p>
              Choose a preferred day and leave your details.
              <br />
              {profile.name || "Your agent"} will confirm the time and
              availability.
            </p>
            {tourButton()}
          </div>
        </section>
        <section
          className="heritage-setting heritage-section heritage-pad"
          id="setting"
        >
          <div className="heritage-section-label">
            <span>
              <Plus size={13} />A sense of place
            </span>
            <span>MAKE ROOM FOR WHAT COMES NEXT</span>
          </div>
          <div className="heritage-setting-layout">
            <div>
              <span className="heritage-kicker">More than an address</span>
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
                  <dt>Living space</dt>
                  <dd>{size}</dd>
                </div>
                <div>
                  <dt>Property type</dt>
                  <dd>{property.type}</dd>
                </div>
              </dl>
              {tourButton("heritage-link")}
            </div>
            <figure>
              {property.images[0] ? (
                <img
                  src={property.images[0]}
                  alt={`${property.title} — the property`}
                  loading="lazy"
                />
              ) : (
                <div className="heritage-image-empty">
                  Your property photograph will appear here.
                </div>
              )}
              <figcaption>
                <MapPin size={18} />
                <span>
                  {property.location || "Your property location"}
                  <small>A PLACE FOR YOUR NEXT CHAPTER</small>
                </span>
              </figcaption>
            </figure>
          </div>
        </section>
        <section className="heritage-invitation">
          {property.images[0] && (
            <img src={property.images[0]} alt="" loading="lazy" />
          )}
          <div>
            <span className="heritage-kicker">
              Some things are better in person
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
      <footer className="heritage-footer heritage-pad">
        <a href="#home">
          {profile.agency || profile.name}
          <Asterisk size={18} strokeWidth={1} />
        </a>
        <p>
          Property information supplied by the listing agent.
          <br />
          Details are subject to verification.
        </p>
        <a href="/">
          Made with my beautiful property. <ArrowUpRight size={12} />
        </a>
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
