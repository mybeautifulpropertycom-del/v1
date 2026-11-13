import { templatePhotos } from "@/lib/template-photos";
import { PropertyImage } from "./property-image";
import { templates, type TemplateId } from "@/lib/model";
export function TemplateMiniature({
  template,
  image = templatePhotos[0],
}: {
  template: TemplateId;
  image?: string;
}) {
  const templateName = templates.find((t) => t.id === template)!.name;
  if (template === "panorama")
    return (
      <div className="template-miniature miniature-atelier" aria-hidden="true">
        <div className="mini-nav">
          <span>{templateName.toUpperCase()} ↗</span>
          <span>MENIU +</span>
        </div>
        <div className="mini-atelier-gallery">
          <PropertyImage src={image} alt="" sizes="320px" />
          <div>
            {templatePhotos.slice(1, 5).map((src) => (
              <PropertyImage src={src} alt="" key={src} sizes="160px" />
            ))}
          </div>
        </div>
        <div className="mini-atelier-title">
          O altă perspectivă.<em>Un loc căruia să-i spui acasă.</em>
        </div>
        <div className="mini-atelier-facts">
          <span>ATENȚIE LA FIECARE DETALIU</span>
          <span>DESCOPERĂ ↗</span>
        </div>
      </div>
    );
  return (
    <div
      className={`template-miniature miniature-${template}`}
      aria-hidden="true"
    >
      <div className="mini-nav">
        <span>{templateName.toUpperCase()}</span>
        <span>CONTACT ↗</span>
      </div>
      <div className="mini-content">
        <div className="mini-copy">
          <span>O PERSPECTIVĂ NOUĂ</span>
          <strong>
            {template === "editorial" ? (
              <>
                O locuință.
                <br />
                Un nou capitol.
              </>
            ) : template === "minimal" ? (
              <>
                Un plus de personalitate.
                <br />
                Un nou început.
              </>
            ) : (
              <>
                Deosebită.
                <br />
                În fiecare zi.
              </>
            )}
          </strong>
          <i>DESCOPERĂ PROPRIETATEA ↗</i>
        </div>
        <PropertyImage src={image} alt="" sizes="480px" />
      </div>
      <div className="mini-bottom">
        <span>GÂNDITĂ PENTRU A FI LOCUITĂ</span>
        <span>01 — 03</span>
      </div>
    </div>
  );
}
