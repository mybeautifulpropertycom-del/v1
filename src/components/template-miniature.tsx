import { photos } from "@/lib/demo";
import type { TemplateId } from "@/lib/model";
export function TemplateMiniature({
  template,
  image = photos.villa,
}: {
  template: TemplateId;
  image?: string;
}) {
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
                A place.
                <br />
                To call home.
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
