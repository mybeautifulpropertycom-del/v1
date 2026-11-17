import { presentationCopy, propertyInvitation } from "@/lib/presentation-copy";
import { propertyTypeLabel } from "@/lib/model";
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
    [
      presentationCopy.introduction.title,
      presentationCopy.introduction.accent,
      copy.introBody,
    ],
    [
      ...(property.template === "panorama"
        ? [
            presentationCopy.introduction.title,
            presentationCopy.introduction.accent,
          ]
        : [copy.storyTitle, copy.storyAccent]),
      copy.storyBody,
    ],
    [
      ...(property.template === "minimal"
        ? [
            presentationCopy.heritageDetails.title,
            presentationCopy.heritageDetails.accent,
          ]
        : [copy.detailsTitle, copy.detailsAccent]),
      copy.detailsBody,
    ],
    [
      ...(property.template === "minimal"
        ? [
            presentationCopy.heritageSetting.title,
            presentationCopy.heritageSetting.accent,
          ]
        : [copy.settingTitle, copy.settingAccent]),
      copy.settingBody,
    ],
    [
      presentationCopy.invitation.title,
      presentationCopy.invitation.accent,
      propertyInvitation(property.location),
    ],
  ];
  return (
    <main className="property-print">
      <PropertyPrintControls publicUrl={url} />
      <article>
        <header className="property-print-heading">
          <p>
            {propertyTypeLabel(property.type)}{" "}
            {property.transaction === "rent" ? "de închiriat" : "de vânzare"}
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
                <dt>Dormitoare</dt>
                <dd>{property.bedrooms}</dd>
              </div>
              <div>
                <dt>Băi</dt>
                <dd>{property.bathrooms}</dd>
              </div>
            </>
          )}
          <div>
            <dt>Suprafață</dt>
            <dd>
              {property.area.toLocaleString("ro-RO")}{" "}
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
            <h2>Dotări</h2>
            <ul>
              {property.amenities.map((amenity) => (
                <li key={amenity}>{amenity}</li>
              ))}
            </ul>
          </section>
        )}
        <section className="property-print-section">
          <h2>
            {presentationCopy.gallery.title} {presentationCopy.gallery.accent}
          </h2>
          {copy.galleryBody && <p>{copy.galleryBody}</p>}
          <div className="property-print-gallery">
            {property.images.slice(1).map((image, index) => (
              <figure key={image}>
                <img
                  src={image}
                  alt={
                    copy.captions[index + 1] ||
                    `${property.title} — fotografia ${index + 2}`
                  }
                  loading="eager"
                />
                <figcaption>{copy.captions[index + 1]}</figcaption>
              </figure>
            ))}
          </div>
        </section>
        <footer className="property-print-contact">
          <h2>Programează o vizionare privată</h2>
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
            Vizitează site-ul pentru detalii actualizate, disponibilitate și
            film.
          </small>
        </footer>
      </article>
    </main>
  );
}
