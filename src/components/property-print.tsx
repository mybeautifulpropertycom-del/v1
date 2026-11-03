import {
  formatPrice,
  publicPath,
  safePhone,
  type PublicProperty,
  type PublicProfile,
} from "@/lib/model";
import { propertyStory } from "@/lib/property-story";
import { siteUrl } from "@/lib/seo";
import { PropertyPrintControls } from "./property-print-controls";

export function PropertyPrint({
  property,
  profile,
}: {
  property: PublicProperty;
  profile: PublicProfile;
}) {
  const copy = propertyStory(property);
  const url = siteUrl(publicPath(property));
  const sections = [
    [copy.introTitle, copy.introAccent, copy.introBody],
    [copy.storyTitle, copy.storyAccent, copy.storyBody],
    [copy.detailsTitle, copy.detailsAccent, copy.detailsBody],
    [copy.settingTitle, copy.settingAccent, copy.settingBody],
    [copy.closingTitle, copy.closingAccent, copy.closingBody],
  ];
  return (
    <main className="property-print">
      <PropertyPrintControls publicUrl={url} />
      <article>
        <header className="property-print-heading">
          <p>
            {property.type}{" "}
            {property.transaction === "rent" ? "for rent" : "for sale"}
          </p>
          <h1>{property.title}</h1>
          <p>{property.location}</p>
          <strong>{formatPrice(property)}</strong>
          {copy.heroIntro && <p>{copy.heroIntro}</p>}
        </header>
        {property.images[0] && (
          <img
            className="property-print-cover"
            src={property.images[0]}
            alt={copy.captions[0] || property.title}
            loading="eager"
          />
        )}
        <dl className="property-print-facts">
          {property.type !== "Land" && (
            <>
              <div>
                <dt>Bedrooms</dt>
                <dd>{property.bedrooms}</dd>
              </div>
              <div>
                <dt>Bathrooms</dt>
                <dd>{property.bathrooms}</dd>
              </div>
            </>
          )}
          <div>
            <dt>Area</dt>
            <dd>
              {property.area.toLocaleString("en-US")}{" "}
              {property.area_unit === "sqm" ? "m²" : "sq ft"}
            </dd>
          </div>
        </dl>
        {sections.map(
          ([title, accent, body], index) =>
            body && (
              <section className="property-print-section" key={index}>
                <h2>
                  {title} {accent}
                </h2>
                <p>{body}</p>
              </section>
            ),
        )}
        {property.amenities.length > 0 && (
          <section className="property-print-section">
            <h2>Features</h2>
            <ul>
              {property.amenities.map((amenity) => (
                <li key={amenity}>{amenity}</li>
              ))}
            </ul>
          </section>
        )}
        <section className="property-print-section">
          <h2>
            {copy.galleryTitle} {copy.galleryAccent}
          </h2>
          {copy.galleryBody && <p>{copy.galleryBody}</p>}
          <div className="property-print-gallery">
            {property.images.slice(1).map((image, index) => (
              <figure key={image}>
                <img
                  src={image}
                  alt={
                    copy.captions[index + 1] ||
                    `${property.title} — view ${index + 2}`
                  }
                  loading="eager"
                />
                <figcaption>{copy.captions[index + 1]}</figcaption>
              </figure>
            ))}
          </div>
        </section>
        <footer className="property-print-contact">
          <h2>Schedule a private tour</h2>
          {profile.name && (
            <p>
              <strong>{profile.name}</strong>
            </p>
          )}
          {profile.agency && <p>{profile.agency}</p>}
          {profile.email && (
            <p>
              <a href={`mailto:${profile.email}`}>{profile.email}</a>
            </p>
          )}
          {profile.phone && (
            <p>
              <a href={`tel:${safePhone(profile.phone)}`}>{profile.phone}</a>
            </p>
          )}
          <p className="property-print-url">
            <a href={url}>{url}</a>
          </p>
          <small>
            View the website for current details, availability and video.
          </small>
        </footer>
      </article>
    </main>
  );
}
