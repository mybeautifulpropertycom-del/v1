"use client";
import { AgentAvatar } from "./agent-avatar";

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

function ScrollGallery({ images, title }: { images: string[]; title: string }) {
  const stage = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState({ pinned: false, active: 0 });
  const captions = [
    ["Start with a", "breath of fresh air."],
    ["A little more", "to fall in love with."],
    ["A closer look.", "A different feeling."],
    ["Imagine the days", "you’ll spend here."],
  ];

  useEffect(() => {
    const root = stage.current;
    if (!root) return;
    const media = matchMedia(
      "(min-width: 900px) and (min-height: 650px) and (prefers-reduced-motion: no-preference)",
    );
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
          <span className="estate-eyebrow">A home, one moment at a time</span>
          <h2 id="scroll-gallery-title">
            Let your curiosity
            <br />
            <em>lead the way.</em>
          </h2>
        </div>
        <div>
          <p>
            Some details are best discovered slowly.
            <br />
            Stay a little. Take it all in.
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
            aria-label="Property photographs"
          >
            {images.map((image, index) => {
              const caption = captions[index % captions.length];
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
                  <img
                    src={image}
                    alt={`${title} — view ${index + 1}`}
                    loading="lazy"
                  />
                  <div className="estate-scene-copy">
                    <span className="estate-eyebrow">
                      A different perspective
                    </span>
                    <h3>
                      {caption[0]}
                      <br />
                      <em>{caption[1]}</em>
                    </h3>
                    <p>
                      There’s more to a home than a first impression.
                      <br />
                      Picture yourself here.
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
      setStatus("This is a preview. No message has been sent.");
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
            "Your message could not be sent. Please try again or contact the agent directly.",
        );
      setSent(true);
      setStatus(
        "Your message is in the agent’s inbox. They can contact you using the details you provided.",
      );
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Your message could not be sent.",
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
              ? "The Editorial · Design preview · Sample property"
              : "Saved website preview · Not a public link"}
          </span>
          {sample ? (
            <Link href="/dashboard/properties/new?template=editorial">
              Use this design <ArrowUpRight size={14} />
            </Link>
          ) : (
            <span>Made for your next chapter</span>
          )}
        </div>
      )}
      <main>
        <section className="estate-hero" id="home">
          <div className="estate-hero-background">
            {property.images[0] ? (
              <img
                src={property.images[0]}
                alt={`${property.title} — main view`}
                fetchPriority="high"
              />
            ) : (
              <div className="estate-photo-empty">
                Your cover photograph will appear here.
              </div>
            )}
          </div>
          <header className="estate-nav estate-pad">
            <a href="#home" className="estate-wordmark">
              {profile.agency || profile.name}
              <span>A MORE PERSONAL WAY HOME</span>
            </a>
            <nav aria-label="Property navigation">
              <a href="#story">The residence</a>
              <a href="#gallery">The gallery</a>
              <a href="#contact">Your agent</a>
            </nav>
            {viewingButton("Arrange a viewing", "estate-nav-cta")}
          </header>
          <div className="estate-hero-content estate-pad">
            <span className="estate-eyebrow">
              <span className="estate-dot" />
              {property.type} ·{" "}
              {property.transaction === "sale"
                ? "Offered for sale"
                : "Offered for rent"}
            </span>
            <h1>
              <EditableText
                field="title"
                value={property.title || "A place to call home."}
                onEdit={onEdit}
              />
            </h1>
            <p>
              Some places you visit.
              <br />
              <em>Others, you call home.</em>
            </p>
            <div className="estate-hero-actions">
              {viewingButton("Find your next chapter")}
              <a href="#gallery" className="estate-text-link">
                Explore the residence <ArrowDown size={16} />
              </a>
            </div>
          </div>
          <div className="estate-hero-bottom estate-pad">
            <span className="estate-location">
              <MapPin size={14} />
              <EditableText
                field="location"
                value={property.location || "Your property location"}
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
                View all {property.images.length} photos
              </button>
            )}
          </div>
        </section>
        <section className="estate-story estate-pad estate-space" id="story">
          <div>
            <span className="estate-eyebrow">
              A little closer to what matters
            </span>
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
                  "Tell the story of your property. Add a description in the editor to bring this space to life."
                }
                onEdit={onEdit}
              />
            </p>
          </div>
          <dl className="estate-facts">
            <div>
              <dt>
                <Square size={16} />
                Living space
              </dt>
              <dd>
                {property.area.toLocaleString("en-US")} <small>{unit}</small>
              </dd>
            </div>
            <div>
              <dt>
                <BedDouble size={17} />
                Bedrooms
              </dt>
              <dd>{property.bedrooms.toString().padStart(2, "0")}</dd>
            </div>
            <div>
              <dt>
                {property.transaction === "rent"
                  ? "Monthly rent"
                  : "Offered at"}
              </dt>
              <dd>{formatPrice(property)}</dd>
            </div>
            <div>
              <dt>
                <Bath size={17} />
                Bathrooms
              </dt>
              <dd>{property.bathrooms.toString().padStart(2, "0")}</dd>
            </div>
          </dl>
        </section>
        <ScrollGallery images={property.images} title={property.title} />
        <section className="estate-details estate-pad estate-space">
          <div className="estate-details-photo">
            {property.images[1] || property.images[0] ? (
              <>
                <img
                  src={property.images[1] || property.images[0]}
                  alt={`${property.title} — a closer perspective`}
                  loading="lazy"
                />
                <button
                  type="button"
                  onClick={() => setLightbox(property.images[1] ? 1 : 0)}
                >
                  A LITTLE CLOSER TO HOME <Expand size={15} />
                </button>
              </>
            ) : (
              <div className="estate-photo-empty">
                Add your property photographs.
              </div>
            )}
          </div>
          <div className="estate-details-copy">
            <span className="estate-eyebrow">
              The details make the difference
            </span>
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
                <dt>Living area</dt>
                <dd>
                  {property.area.toLocaleString("en-US")} {unit}
                </dd>
              </div>
              <div>
                <dt>Bedrooms</dt>
                <dd>{property.bedrooms}</dd>
              </div>
              <div>
                <dt>Bathrooms</dt>
                <dd>{property.bathrooms}</dd>
              </div>
              <div>
                <dt>Property type</dt>
                <dd>{property.type}</dd>
              </div>
              <div>
                <dt>Location</dt>
                <dd>{property.location || "—"}</dd>
              </div>
              <div>
                <dt>
                  {property.transaction === "rent"
                    ? "Monthly rent"
                    : "Asking price"}
                </dt>
                <dd>{formatPrice(property)}</dd>
              </div>
            </dl>
            {property.amenities.length > 0 && (
              <ul>
                {property.amenities.map((amenity) => (
                  <li key={amenity}>
                    <Check size={14} />
                    {amenity}
                  </li>
                ))}
              </ul>
            )}
            {viewingButton("Experience it in person")}
          </div>
        </section>
        <section
          className="estate-gallery estate-pad estate-space"
          id="gallery"
        >
          <div className="estate-section-heading">
            <div>
              <span className="estate-eyebrow">The complete picture</span>
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
            <p>
              {String(property.images.length).padStart(2, "0")} PHOTOGRAPHS
              <br />
              <span>
                <EditableText
                  field="copy.galleryBody"
                  value={copy.galleryBody}
                  onEdit={onEdit}
                />
              </span>
            </p>
          </div>
          <div className="estate-gallery-grid">
            {property.images.map((image, index) => (
              <button
                key={`${image}-${index}`}
                type="button"
                aria-label={`Enlarge property photo ${index + 1}`}
                onClick={() => setLightbox(index)}
              >
                <img
                  src={image}
                  alt={`${property.title} — view ${index + 1}`}
                  loading="lazy"
                />
                <span>
                  {String(index + 1).padStart(2, "0")}
                  <Expand size={17} />
                </span>
              </button>
            ))}
          </div>
          {!property.images.length && (
            <p className="estate-gallery-empty">
              Your property photographs will appear here.
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
                <span className="estate-eyebrow">The residence, in motion</span>
                <h2 id="film-title">
                  Before you step <em>inside.</em>
                </h2>
              </div>
              <p>
                A different way to see it.
                <br />A little closer to being here.
              </p>
            </div>
            {film?.src ? (
              <video
                className="estate-film-player"
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
            ) : (
              <div className="estate-film-preview">
                {property.images[1] || property.images[0] ? (
                  <img
                    src={property.images[1] || property.images[0]}
                    alt=""
                    loading="lazy"
                  />
                ) : null}
                <div>
                  <Film size={30} strokeWidth={1} />
                  <span>YOUR PROPERTY, IN MOTION</span>
                  <h3>
                    A story worth <em>watching.</em>
                  </h3>
                  <p>Your completed property film will appear here.</p>
                  <small>
                    Video layout preview · No film has been generated yet
                  </small>
                </div>
                <span className="estate-film-mark">THE PROPERTY FILM</span>
              </div>
            )}
          </section>
        )}
        <section
          className="estate-contact estate-pad estate-space"
          id="contact"
        >
          <div className="estate-agent landing-agent">
            <span className="estate-eyebrow">A personal introduction</span>
            <h2>
              A new home.
              <br />
              <em>A familiar face.</em>
            </h2>
            <div className="estate-agent-person landing-agent-profile">
              <span className="estate-agent-monogram">
                <AgentAvatar profile={profile} />
              </span>
              <div>
                <strong>{profile.name || "Your agent"}</strong>
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
            {viewingButton("Let’s find a day to meet", "estate-text-link")}
          </div>
          <form className="estate-inquiry" onSubmit={submit}>
            <span className="estate-eyebrow">
              Every chapter starts with hello
            </span>
            <h3>
              Let’s make it <em>personal.</em>
            </h3>
            <p>A question, a thought, a possibility. We’d love to hear it.</p>
            <label>
              Your name
              <input
                required
                name="name"
                autoComplete="name"
                minLength={2}
                maxLength={100}
                placeholder="Your first and last name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <div className="estate-field-pair">
              <label>
                Email address
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
                Phone <span>(optional)</span>
                <input
                  type="tel"
                  name="phone"
                  autoComplete="tel"
                  maxLength={30}
                  placeholder="+1 (555) 000-0000"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </label>
            </div>
            <label>
              Your message
              <textarea
                required
                minLength={10}
                maxLength={2000}
                rows={3}
                placeholder="I’d love to know a little more about this home…"
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
              />
            </label>
            <div className="honeypot" aria-hidden="true">
              <label>
                Leave this empty
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
                ? "Sending…"
                : sent
                  ? "Message received"
                  : isPreview
                    ? "Try the contact form"
                    : "Send a little hello"}
              {sent ? <Check size={17} /> : <ArrowUpRight size={17} />}
            </button>
            <small>
              By sending, you agree to be contacted by{" "}
              {profile.name || "the agent"} about this property. Your details
              are stored in their private inbox.
            </small>
            {isPreview && (
              <small>Preview only. This form does not send messages.</small>
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
            <img
              className="estate-invitation-image"
              src={property.images[0]}
              alt=""
              loading="lazy"
            />
          )}
          <div className="estate-invitation-content">
            <span className="estate-eyebrow">Your next chapter is waiting</span>
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
            {viewingButton("Arrange your private viewing")}
            <span className="estate-invitation-note">
              <CalendarDays size={15} />A day that works for you. A home that
              feels like you.
            </span>
            <p className="estate-invitation-price">{formatPrice(property)}</p>
          </div>
        </section>
      </main>
      <footer className="estate-footer estate-pad">
        <div>
          <a href="#home">{profile.agency || profile.name}</a>
          <span>{property.location}</span>
        </div>
        <p>
          Property information supplied by the listing agent.
          <br />
          Details are subject to verification.
        </p>
        <a href="/">
          Made beautiful with
          <br />
          <strong>my beautiful property.</strong> <ArrowUpRight size={14} />
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
