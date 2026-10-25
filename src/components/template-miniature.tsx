import { photos } from "@/lib/demo";
import type { TemplateId } from "@/lib/model";
export function TemplateMiniature({
  template,
  image = photos.villa,
}: {
  template: TemplateId;
  image?: string;
}) {
  if (template === "panorama")
    return (
      <div className="template-miniature miniature-atelier" aria-hidden="true">
        <div className="mini-nav">
          <span>THE ATELIER ↗</span>
          <span>MENU +</span>
        </div>
        <div className="mini-atelier-gallery">
          <img src={image} alt="" loading="lazy" />
          <div>
            {[
              photos.interior,
              photos.bedroom,
              photos.kitchen,
              photos.apartment,
            ].map((src, i) => (
              <img src={src || image} alt="" key={i} loading="lazy" />
            ))}
          </div>
        </div>
        <div className="mini-atelier-title">
          A different perspective.<em>A place to call home.</em>
        </div>
        <div className="mini-atelier-facts">
          <span>THOUGHTFULLY CONSIDERED</span>
          <span>EXPLORE ↗</span>
        </div>
      </div>
    );
  return (
    <div
      className={`template-miniature miniature-${template}`}
      aria-hidden="true"
    >
      <div className="mini-nav">
        <span>THE HOME EDIT</span>
        <span>CONTACT ↗</span>
      </div>
      <div className="mini-content">
        <div className="mini-copy">
          <span>A FRESH PERSPECTIVE</span>
          <strong>
            {template === "editorial" ? (
              <>
                A home.
                <br />A new chapter.
              </>
            ) : template === "minimal" ? (
              <>
                A little character.
                <br />A new beginning.
              </>
            ) : (
              <>
                Extraordinary.
                <br />
                Every day.
              </>
            )}
          </strong>
          <i>EXPLORE THE PROPERTY ↗</i>
        </div>
        <img src={image} alt="" loading="lazy" />
      </div>
      <div className="mini-bottom">
        <span>DESIGNED FOR LIVING</span>
        <span>01 — 03</span>
      </div>
    </div>
  );
}
