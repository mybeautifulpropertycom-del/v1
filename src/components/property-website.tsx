"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUpRight,
  Bath,
  BedDouble,
  Check,
  ChevronLeft,
  ChevronRight,
  Expand,
  Mail,
  MapPin,
  Phone,
  Square,
  X,
} from "lucide-react";
import {
  formatPrice,
  safePhone,
  type PublicProfile,
  type PublicProperty,
} from "@/lib/model";

import { propertyStory } from "@/lib/property-story";
import { EditableText, type EditableField } from "./website-editable-text";
import { EditorialWebsite, type PropertyFilm } from "./editorial-website";
import { HeritageWebsite } from "./heritage-website";
export type { EditableField } from "./website-editable-text";

export type PropertyWebsiteProps = {
  property: PublicProperty;
  profile: PublicProfile;
  preview?: boolean;
  sample?: boolean;
  onEdit?: (field: EditableField, value: string) => void;
  film?: PropertyFilm;
};

export function PropertyWebsite(props: PropertyWebsiteProps) {
  if (props.property.template === "editorial")
    return <EditorialWebsite {...props} />;
  if (props.property.template === "minimal")
    return <HeritageWebsite {...props} />;
  return <ClassicPropertyWebsite {...props} />;
}

function ClassicPropertyWebsite({
  property,
  profile,
  preview = false,
  sample = false,
  onEdit,
}: {
  property: PublicProperty;
  profile: PublicProfile;
  preview?: boolean;
  sample?: boolean;
  onEdit?: (field: EditableField, value: string) => void;
}) {
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
  const copy = propertyStory(property);
  const unit = property.area_unit === "sqm" ? "m²" : "sq ft";
  useEffect(() => {
    if (lightbox === null) return;
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") setLightbox(null);
      if (e.key === "ArrowRight")
        setLightbox((i) =>
          i === null ? null : (i + 1) % property.images.length,
        );
      if (e.key === "ArrowLeft")
        setLightbox((i) =>
          i === null
            ? null
            : (i - 1 + property.images.length) % property.images.length,
        );
    }
    document.addEventListener("keydown", key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
    };
  }, [lightbox, property.images.length]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (preview || sample) {
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
    } catch (e) {
      setStatus(
        e instanceof Error ? e.message : "Your message could not be sent.",
      );
    } finally {
      setBusy(false);
    }
  }
  const facts = (
    <div className="landing-facts">
      <div>
        <BedDouble size={21} />
        <strong>{property.bedrooms}</strong>
        <span>Bedrooms</span>
      </div>
      <div>
        <Bath size={21} />
        <strong>{property.bathrooms}</strong>
        <span>Bathrooms</span>
      </div>
      <div>
        <Square size={20} />
        <strong>{property.area.toLocaleString("en-US")}</strong>
        <span>{unit} of living</span>
      </div>
      <div>
        <span className="fact-price">{formatPrice(property)}</span>
        <span>
          {property.transaction === "rent" ? "Monthly rent" : "Offered at"}
        </span>
      </div>
    </div>
  );
  return (
    <div className={`property-website website-${property.template}`}>
      {(preview || sample) && (
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
              ? "Design preview · Sample property"
              : "Saved website preview · Not a public link"}
          </span>
          {sample ? (
            <Link
              href={`/dashboard/properties/new?template=${property.template}`}
            >
              Use this design <ArrowUpRight size={14} />
            </Link>
          ) : (
            <span className="preview-device-label">
              Looks beautiful on every screen
            </span>
          )}
        </div>
      )}
      <nav className="landing-nav">
        <a className="agent-wordmark" href="#home">
          {profile.agency || profile.name}
          <span>EXCEPTIONAL HOMES. PERSONAL SERVICE.</span>
        </a>
        <div>
          <a href="#story">The home</a>
          <a href="#gallery">Gallery</a>
          <a href="#contact" className="landing-contact-link">
            Let’s talk <ArrowUpRight size={15} />
          </a>
        </div>
      </nav>
      <section className="landing-hero" id="home">
        <div className="landing-hero-copy">
          <span className="landing-eyebrow">
            <span />
            {property.type} ·{" "}
            {property.transaction === "sale" ? "For sale" : "For rent"}
          </span>
          <h1>
            <EditableText
              field="title"
              value={property.title || "A place to call home."}
              onEdit={onEdit}
            />
          </h1>
          <p>
            <MapPin size={15} />
            <EditableText
              field="location"
              value={property.location || "Your property location"}
              onEdit={onEdit}
            />
          </p>
          <a href="#contact" className="landing-button">
            Find your next chapter <ArrowUpRight size={17} />
          </a>
          <span className="landing-hero-caption">
            THOUGHTFULLY CHOSEN. BEAUTIFULLY YOURS.
          </span>
        </div>
        <div className="landing-hero-image">
          {property.images[0] ? (
            <img
              src={property.images[0]}
              alt={`${property.title} — main view`}
              fetchPriority="high"
            />
          ) : (
            <div className="landing-image-empty">
              Your cover photograph will appear here
            </div>
          )}
          <button
            onClick={() => property.images.length && setLightbox(0)}
            className="view-photos"
          >
            <Expand size={16} />
            View all {property.images.length} photos
          </button>
        </div>
        <a href="#story" className="landing-scroll">
          <ArrowDown size={18} />
          <span>TAKE A CLOSER LOOK</span>
        </a>
      </section>
      {facts}
      <section className="landing-story landing-section" id="story">
        <div>
          <span className="landing-eyebrow">01 / THE FEELING OF HOME</span>
          <h2>
            Some places
            <br />
            just <em>feel different.</em>
          </h2>
        </div>
        <div className="landing-story-copy">
          <p>
            <EditableText
              field="copy.storyBody"
              value={
                copy.storyBody ||
                "Your property’s story will appear here. Add a description in the editor to bring this space to life."
              }
              onEdit={onEdit}
            />
          </p>
          <div className="landing-amenities">
            {property.amenities.map((a) => (
              <span key={a}>
                <Check size={14} />
                {a}
              </span>
            ))}
          </div>
        </div>
      </section>
      <section className="landing-gallery landing-section" id="gallery">
        <div className="landing-section-heading">
          <div>
            <span className="landing-eyebrow">02 / A CLOSER LOOK</span>
            <h2>
              Picture yourself <em>here.</em>
            </h2>
          </div>
          <span>
            {String(property.images.length).padStart(2, "0")} PHOTOGRAPHS
          </span>
        </div>
        <div className="landing-gallery-grid">
          {property.images.map((image, i) => (
            <button
              key={image}
              onClick={() => setLightbox(i)}
              aria-label={`Enlarge property photo ${i + 1}`}
            >
              <img
                src={image}
                alt={`${property.title} — view ${i + 1}`}
                loading="lazy"
              />
              <span>
                <Expand size={18} />
              </span>
            </button>
          ))}
        </div>
      </section>
      <section className="landing-contact landing-section" id="contact">
        <div className="landing-agent">
          <span className="landing-eyebrow">03 / YOUR NEXT CHAPTER</span>
          <h2>
            Let’s open
            <br />
            <em>the door.</em>
          </h2>
          <p>
            Have a question? Ready for a closer look?
            <br />
            Your next chapter starts with a conversation.
          </p>
          <div className="landing-agent-profile">
            <span className="landing-agent-avatar">
              {profile.name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")}
            </span>
            <div>
              <strong>{profile.name}</strong>
              <span>{profile.agency}</span>
            </div>
          </div>
          {profile.bio && <p className="landing-agent-bio">{profile.bio}</p>}
          <a href={`tel:${safePhone(profile.phone)}`}>
            <Phone size={16} />
            {profile.phone}
          </a>
          <a href={`mailto:${profile.email}`}>
            <Mail size={16} />
            {profile.email}
          </a>
        </div>
        <form className="landing-inquiry" onSubmit={submit}>
          <h3>A beautiful beginning.</h3>
          <p>Tell us a little about yourself. We’ll take it from here.</p>
          <label>
            Your name
            <input
              required
              name="name"
              autoComplete="name"
              maxLength={100}
              placeholder="Alex Morgan"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <div className="field-grid">
            <label>
              Email address
              <input
                type="email"
                required
                name="email"
                autoComplete="email"
                maxLength={254}
                placeholder="alex@example.com"
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
              placeholder="I’d love to learn more about this home…"
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
                onChange={(e) => setForm({ ...form, website: e.target.value })}
              />
            </label>
          </div>
          <button className="landing-button" disabled={busy || sent}>
            {busy
              ? "Sending…"
              : sent
                ? "Message received"
                : preview || sample
                  ? "Try the contact form"
                  : "Let’s connect"}
            {sent ? <Check size={17} /> : <ArrowUpRight size={17} />}
          </button>
          <small>
            By sending, you agree to be contacted by{" "}
            {profile.name || "the agent"} about this property. Your details are
            stored in their private inbox.
          </small>
          {(preview || sample) && (
            <small className="preview-form-note">
              Preview only. This form does not send messages.
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
      <footer className="landing-footer">
        <span>{profile.agency || profile.name}</span>
        <span>
          Property information supplied by the listing agent. Details are
          subject to verification.
        </span>
        <a href="/">
          Made beautiful with <strong>my beautiful property.</strong>
          <ArrowUpRight size={13} />
        </a>
      </footer>
      {lightbox !== null && (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Property photo gallery"
          onClick={() => setLightbox(null)}
        >
          <button
            className="lightbox-close"
            aria-label="Close gallery"
            onClick={() => setLightbox(null)}
          >
            <X size={26} />
          </button>
          <button
            className="lightbox-prev"
            aria-label="Previous photo"
            onClick={(e) => {
              e.stopPropagation();
              setLightbox(
                (lightbox - 1 + property.images.length) %
                  property.images.length,
              );
            }}
          >
            <ChevronLeft size={30} />
          </button>
          <img
            src={property.images[lightbox]}
            alt={`${property.title} — view ${lightbox + 1}`}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="lightbox-next"
            aria-label="Next photo"
            onClick={(e) => {
              e.stopPropagation();
              setLightbox((lightbox + 1) % property.images.length);
            }}
          >
            <ChevronRight size={30} />
          </button>
          <span>
            {lightbox + 1} / {property.images.length}
          </span>
        </div>
      )}
    </div>
  );
}
