import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, Smartphone } from "lucide-react";
import { templates } from "@/lib/model";
import { TemplateMiniature } from "@/components/template-miniature";
export default function Page() {
  return (
    <>
      <div className="page-heading compact workspace-tab-heading">
        <div>
          <span className="eyebrow">COLECȚIA DE DESIGNURI</span>
          <h1>
            O prezentare deosebită.
            <br />
            <em>Pentru o locuință deosebită.</em>
          </h1>
          <p>Trei stiluri distincte. O primă impresie memorabilă.</p>
        </div>
        <span className="collection-number">01 — 03</span>
      </div>
      <div className="templates-gallery">
        {templates.map((t) => (
          <article className="template-gallery-card" key={t.id}>
            <Link href={`/modele/${t.id}`}>
              <TemplateMiniature template={t.id} />
            </Link>
            <div className="template-gallery-copy">
              <span className="eyebrow">{t.tag}</span>
              <h2>{t.name}</h2>
              <p>{t.description}</p>
              <div>
                <Link href={`/modele/${t.id}`} className="button secondary">
                  Descoperă designul <ArrowUpRight size={16} />
                </Link>
                <Link
                  className="text-button"
                  href={`/panou/proprietati/noua?template=${t.id}`}
                >
                  Folosește acest design <ArrowRight size={15} />
                </Link>
              </div>
            </div>
          </article>
        ))}
      </div>
      <div className="collection-benefits">
        <span>
          <Smartphone size={19} />
          Frumos pe orice ecran
        </span>
        <span>
          <Check size={19} />
          Datele tale de contact, adăugate automat
        </span>
        <span>
          <Check size={19} />
          Schimbă designul oricând
        </span>
      </div>
    </>
  );
}
