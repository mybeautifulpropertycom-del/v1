"use client";
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
import { propertyStory, type WebsiteCopyField } from "@/lib/property-story";
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
      Schedule a tour <ArrowUpRight size={17} />
    </button>
  );
  const photo = (src: string, index: number, className = "") => (
    <button
      type="button"
      className={className}
      key={`${src}-${index}`}
      onClick={() => setLightbox(index)}
      aria-label={`Enlarge property photo ${index + 1}`}
    >
      <PropertyImage
        src={src}
        alt={copy.captions[index] || `${property.title} — view ${index + 1}`}
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

  return (
    <div className="atelier-website website-panorama">
      {isPreview && (
        <div className="preview-bar">
          <Link
            href={
              previewBackLink?.href ||
              (sample
                ? "/dashboard/templates"
                : `/dashboard/properties/${property.id}`)
            }
          >
            <ArrowLeft size={15} />
            {previewBackLink?.label ||
              (sample ? "Back to collection" : "Back to editor")}
          </Link>
          <span>
            {sample
              ? "Design preview · Sample property"
              : "Saved website preview · Not a public link"}
          </span>
          {sample && (
            <Link href="/dashboard/properties/new?template=panorama">
              Use this design <ArrowUpRight size={14} />
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
            {profile.agency || profile.name || "Your agent"}
            <small>A MORE PERSONAL PERSPECTIVE</small>
          </span>
        </a>
        <nav aria-label="Property navigation">
          <a href="#residence">The residence</a>
          <a href="#gallery">Photographs</a>
          <a href="#contact">Your agent</a>
        </nav>
        <button
          className="atelier-menu-button"
          aria-expanded={menu}
          aria-controls="atelier-menu"
          onClick={() => setMenu(!menu)}
        >
          {menu ? "Close" : "Menu"}
          {menu ? <X size={18} /> : <Plus size={18} />}
        </button>
        {menu && (
          <nav
            id="atelier-menu"
            className="atelier-menu"
            aria-label="More property links"
          >
            <a href="#residence" onClick={() => setMenu(false)}>
              The residence <ArrowUpRight />
            </a>
            <a href="#details" onClick={() => setMenu(false)}>
              The details <ArrowUpRight />
            </a>
            <a href="#gallery" onClick={() => setMenu(false)}>
              All photographs <ArrowUpRight />
            </a>
            <a href="#contact" onClick={() => setMenu(false)}>
              Meet your agent <ArrowUpRight />
            </a>
            {tour()}
          </nav>
        )}
      </header>
      <main>
        <section
          className={`atelier-mosaic ${side.length ? "" : "atelier-mosaic-single"}`}
          aria-label="Property photographs"
        >
          {property.images[0] ? (
            <button
              className="atelier-cover"
              onClick={() => setLightbox(0)}
              aria-label="Enlarge property photo 1"
            >
              <PropertyImage
                src={property.images[0]}
                alt={`${property.title} — cover photograph`}
                fetchPriority="high"
                sizes="100vw"
              />
              <span className="atelier-cover-label">
                {property.type}
                <span>
                  {property.transaction === "rent" ? "FOR RENT" : "FOR SALE"}
                </span>
              </span>
              <span className="atelier-cover-note">
                A first look. <ArrowUpRight size={18} />
              </span>
            </button>
          ) : (
            <div className="atelier-no-photo">
              Your property photographs belong here.
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
              View all {property.images.length} photos
            </button>
          )}
        </section>
        <section className="atelier-intro atelier-pad" id="residence">
          <div className="atelier-intro-top">
            <span className="atelier-kicker">
              <MapPin size={13} />
              <EditableText
                field="location"
                value={property.location || "Property location"}
                onEdit={onEdit}
              />
            </span>
            <a href="#details" className="atelier-text-link">
              Discover the details <ArrowRight size={16} />
            </a>
          </div>
          <div className="atelier-title-row">
            <h1>
              <EditableText
                field="title"
                value={property.title || "A different perspective."}
                onEdit={onEdit}
              />
              <em>{text("heroLine")}</em>
            </h1>
            <div className="atelier-intro-copy">
              <p>{text("introBody")}</p>
              {tour()}
            </div>
          </div>
          <dl className="atelier-facts">
            <div>
              <dt>
                {property.transaction === "rent"
                  ? "Monthly rent"
                  : "Offered at"}
              </dt>
              <dd>{formatPrice(property)}</dd>
            </div>
            <div>
              <dt>Bedrooms</dt>
              <dd>{property.bedrooms.toString().padStart(2, "0")}</dd>
            </div>
            <div>
              <dt>Bathrooms</dt>
              <dd>{property.bathrooms.toString().padStart(2, "0")}</dd>
            </div>
            <div>
              <dt>Living space</dt>
              <dd>
                {property.area.toLocaleString("en-US")} <small>{unit}</small>
              </dd>
            </div>
            <div>
              <dt>Property type</dt>
              <dd className="atelier-type">{property.type}</dd>
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
              <div className="atelier-no-photo">A closer perspective</div>
            )}
            <figcaption>
              <span>A CLOSER PERSPECTIVE</span>
              <span>{property.location}</span>
            </figcaption>
          </figure>
          <div className="atelier-story-copy">
            <span className="atelier-kicker">FEEL AT HOME</span>
            <h2>
              {text("storyTitle")}
              <em>{text("storyAccent")}</em>
            </h2>
            <p>{text("storyBody")}</p>
            <a className="atelier-round-link" href="#gallery">
              <span>Explore every angle</span>
              <ArrowUpRight size={24} />
            </a>
          </div>
        </section>
        <section className="atelier-details atelier-pad" id="details">
          <div className="atelier-details-heading">
            <span className="atelier-kicker">EVERYDAY DETAILS</span>
            <h2>
              {text("detailsTitle")}
              <em>{text("detailsAccent")}</em>
            </h2>
          </div>
          <div className="atelier-details-copy">
            <dl className="atelier-spec-grid">
              <div>
                <dt>Living area</dt>
                <dd>
                  {property.area.toLocaleString("en-US")} <small>{unit}</small>
                </dd>
              </div>
              <div>
                <dt>Property type</dt>
                <dd>{property.type}</dd>
              </div>
              <div>
                <dt>Bedrooms</dt>
                <dd>{property.bedrooms.toString().padStart(2, "0")}</dd>
              </div>
              <div>
                <dt>Bathrooms</dt>
                <dd>{property.bathrooms.toString().padStart(2, "0")}</dd>
              </div>
              <div className="atelier-spec-location">
                <dt>Location</dt>
                <dd>{property.location}</dd>
              </div>
              <div>
                <dt>
                  {property.transaction === "rent"
                    ? "Monthly rent"
                    : "Offered at"}
                </dt>
                <dd>{formatPrice(property)}</dd>
              </div>
            </dl>
            {property.amenities.length > 0 && (
              <div className="atelier-extras">
                <h3>Thoughtful extras</h3>
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
              <div className="atelier-no-photo">
                The details make the difference.
              </div>
            )}
            <span>
              THE DETAILS MAKE THE DIFFERENCE <ArrowUpRight size={18} />
            </span>
          </div>
        </section>
        <section className="atelier-gallery atelier-pad" id="gallery">
          <div className="atelier-section-heading">
            <div>
              <span className="atelier-kicker">A CLOSER LOOK</span>
              <h2>
                {text("galleryTitle")}
                <em>{text("galleryAccent")}</em>
              </h2>
            </div>
            <div>
              <p>{text("galleryBody")}</p>
            </div>
          </div>
          <div className="atelier-photo-grid">
            {property.images.map((src, index) => (
              <figure key={`${src}-${index}`}>
                {photo(src, index)}
                <figcaption>{copy.captions[index]}</figcaption>
              </figure>
            ))}
          </div>
          {!property.images.length && <p>Your photographs will appear here.</p>}
        </section>
        {(film?.src || isPreview) && (
          <section className="atelier-film atelier-pad" id="film">
            <div className="atelier-film-heading">
              <span className="atelier-kicker">IN MOTION</span>
              <h2>
                Step inside.<em>Feel at home.</em>
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
                aria-label={`${property.title} — property film`}
              >
                <source src={film.src} />
                {film.captions && (
                  <track
                    kind="captions"
                    src={film.captions}
                    srcLang="en"
                    label="English"
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
                <span>Your property, in motion.</span>
                <p>Your completed property film will appear here.</p>
                <small>
                  Video layout preview · No film has been generated yet
                </small>
              </div>
            )}
          </section>
        )}
        <section className="atelier-contact atelier-pad" id="contact">
          <div className="landing-agent">
            <span className="atelier-kicker">YOUR AGENT</span>
            <h2>
              Let’s connect.<em>Meet your agent.</em>
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
                Phone
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
                  onChange={(e) =>
                    setForm({ ...form, website: e.target.value })
                  }
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
              {profile.name || "the agent"} about this property. Your details
              are stored in their private inbox.
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
          <span className="atelier-kicker">YOUR NEXT CHAPTER, IN PERSON</span>
          <h2>
            {text("closingTitle")}
            <em>{text("closingAccent")}</em>
          </h2>
          <p>{text("closingBody")}</p>
          {tour()}
          <span className="atelier-invitation-footnote">
            One conversation. A new perspective.
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
            {property.transaction === "rent" ? "Monthly rent" : "Offered at"}
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
