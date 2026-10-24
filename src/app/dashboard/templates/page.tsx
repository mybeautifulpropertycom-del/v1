import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, Smartphone } from "lucide-react";
import { templates } from "@/lib/model";
import { TemplateMiniature } from "@/components/template-miniature";
export default function Page() {
  return (
    <>
      <div className="page-heading compact">
        <div>
          <span className="eyebrow">THE DESIGN COLLECTION</span>
          <h1>
            A beautiful frame.
            <br />
            <em>For an extraordinary home.</em>
          </h1>
          <p>Three distinct personalities. One beautiful first impression.</p>
        </div>
        <span className="collection-number">01 — 03</span>
      </div>
      <div className="templates-gallery">
        {templates.map((t, i) => (
          <article className="template-gallery-card" key={t.id}>
            <Link href={`/templates/${t.id}`}>
              <TemplateMiniature template={t.id} />
            </Link>
            <div className="template-gallery-copy">
              <span className="eyebrow">
                0{i + 1} / {t.tag}
              </span>
              <h2>{t.name}</h2>
              <p>{t.description}</p>
              <div>
                <Link href={`/templates/${t.id}`} className="button secondary">
                  Explore design <ArrowUpRight size={16} />
                </Link>
                <Link
                  className="text-button"
                  href={`/dashboard/properties/new?template=${t.id}`}
                >
                  Use this design <ArrowRight size={15} />
                </Link>
              </div>
            </div>
          </article>
        ))}
      </div>
      <div className="collection-benefits">
        <span>
          <Smartphone size={19} />
          Beautiful on every screen
        </span>
        <span>
          <Check size={19} />
          Your contact details, automatically
        </span>
        <span>
          <Check size={19} />
          Switch designs at any time
        </span>
      </div>
    </>
  );
}
