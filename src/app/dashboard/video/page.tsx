"use client";
import Link from "next/link";
import { ArrowUpRight, Film, Plus } from "lucide-react";
import { useWorkspace } from "@/components/workspace-provider";
export default function Page() {
  const { properties } = useWorkspace();
  return (
    <>
      <div className="page-heading compact">
        <div>
          <span className="eyebrow">PROPRIETĂȚILE TALE PRIND VIAȚĂ</span>
          <h1>
            O poveste care merită <em>văzută.</em>
          </h1>
          <p>
            Un film de prezentare inclus pentru fiecare proprietate publicată.
          </p>
        </div>
      </div>
      {properties.length ? (
        <div className="video-property-grid">
          {properties.map((property) => (
            <article className="video-property-card" key={property.id}>
              {property.images[0] ? (
                <img src={property.images[0]} alt={property.title} />
              ) : (
                <div className="video-property-placeholder">
                  <Film size={36} />
                </div>
              )}
              <div>
                <span className="eyebrow">
                  {property.status === "published"
                    ? "FILMUL PROPRIETĂȚII TALE"
                    : "DĂ VIAȚĂ PROPRIETĂȚII TALE"}
                </span>
                <h2>{property.title || "Următoarea ta proprietate"}</h2>
                <p>
                  {property.status === "published"
                    ? "Deschide editorul site-ului pentru a vedea filmul sau a urmări progresul."
                    : "Publică proprietatea pentru a genera filmul. Transformă fotografiile salvate într-o prezentare pentru viitorii cumpărători."}
                </p>
                <Link
                  className="button primary"
                  href={`/preview/${property.id}${property.status === "published" ? "#film" : ""}`}
                >
                  {property.status === "published"
                    ? "Vezi site-ul și filmul"
                    : "Publică proprietatea"}
                  <ArrowUpRight size={16} />
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <Film size={35} />
          <h2>Următoarea poveste începe cu o proprietate.</h2>
          <p>
            Adaugă detaliile și fotografiile, apoi previzualizează site-ul
            înainte de publicare.
          </p>
          <Link className="button primary" href="/dashboard/properties/new">
            <Plus size={16} />
            Adaugă o proprietate
          </Link>
        </div>
      )}
    </>
  );
}
