"use client";
import { propertyTypeLabel } from "@/lib/model";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Bath,
  BedDouble,
  Building2,
  ExternalLink,
  FilePenLine,
  Globe2,
  ImagePlus,
  LayoutGrid,
  List,
  MapPin,
  Plus,
  Search,
  SlidersHorizontal,
  Square,
  Megaphone,
  X,
} from "lucide-react";
import { DeleteAction } from "./delete-action";
import { useWorkspace } from "./workspace-provider";
import {
  formatPrice,
  profileErrors,
  templates,
  type Property,
} from "@/lib/model";
import { TemplateMiniature } from "./template-miniature";

function PropertyCard({
  property,
  demo,
}: {
  property: Property;
  demo: boolean;
}) {
  const { deleteProperty } = useWorkspace();
  const template = templates.find((t) => t.id === property.template)!;
  return (
    <article className="property-card">
      <Link
        href={`/panou/proprietati/${property.id}`}
        className="property-image"
      >
        {property.images[0] ? (
          <img
            src={property.images[0]}
            alt={property.title || "Proprietate fără titlu"}
          />
        ) : (
          <span className="image-placeholder">
            <ImagePlus size={35} />
            Adaugă prima fotografie
          </span>
        )}
        <span className={`status-badge ${property.status}`}>
          <span />
          {property.status === "published"
            ? demo
              ? "Publicat în demo"
              : "Publicat"
            : "Ciornă"}
        </span>
        <span className="image-count">
          <LayoutGrid size={12} />
          {property.images.length}
        </span>
      </Link>
      <div className="property-card-body">
        <div className="property-type">
          {propertyTypeLabel(property.type)}
          <span>
            {property.transaction === "sale" ? "De vânzare" : "De închiriat"}
          </span>
        </div>
        <Link
          href={`/panou/proprietati/${property.id}`}
          data-guide-property={property.id}
        >
          <h3>{property.title || "Proprietate fără titlu"}</h3>
        </Link>
        <p className="location">
          <MapPin size={14} />
          {property.location || "Adresă necompletată"}
        </p>
        <div className="property-features">
          <span>
            <BedDouble size={15} />
            {property.bedrooms} dormitoare
          </span>
          <span>
            <Bath size={15} />
            {property.bathrooms} băi
          </span>
          <span>
            <Square size={14} />
            {property.area.toLocaleString("ro-RO")}{" "}
            {property.area_unit === "sqm" ? "m²" : "sq ft"}
          </span>
        </div>
        <div className="card-price-row">
          <strong>
            {property.price ? formatPrice(property) : "Preț necompletat"}
          </strong>
          <span className="template-label">
            {template.name.replace("The ", "")}
          </span>
        </div>
      </div>
      <div className="property-card-footer">
        <Link href={`/previzualizare/${property.id}`}>
          <FilePenLine size={15} />
          Editează site-ul
        </Link>
        <Link
          href={`/previzualizare/${property.id}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Previzualizează ${property.title} (se deschide într-o filă nouă)`}
          title="Deschide previzualizarea într-o filă nouă"
        >
          <ExternalLink size={15} />
        </Link>
        <DeleteAction
          label={`Șterge ${property.title || "proprietatea"}`}
          confirmation={`Ștergi „${property.title || "Proprietate fără titlu"}”? Proprietatea și pagina publică vor fi eliminate definitiv. Mesajele rămân în inbox. Acțiunea nu poate fi anulată.`}
          onDelete={() => deleteProperty(property)}
        />
      </div>
    </article>
  );
}

export function Dashboard() {
  const { profile, properties, demo } = useWorkspace();
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("recent");
  const [layout, setLayout] = useState("grid");
  const [filters, setFilters] = useState(false);
  const [type, setType] = useState("all");
  const published = properties.filter((p) => p.status === "published").length;
  const visible = properties
    .filter(
      (p) =>
        (tab === "all" || p.status === tab) &&
        (type === "all" ||
          p.type === type ||
          (type === "House" && p.type === "Town House")) &&
        `${p.title} ${p.location}`
          .toLocaleLowerCase("ro-RO")
          .includes(query.toLocaleLowerCase("ro-RO")),
    )
    .sort((a, b) =>
      sort === "price"
        ? b.price - a.price
        : sort === "name"
          ? a.title.localeCompare(b.title, "ro-RO")
          : b.created_at.localeCompare(a.created_at),
    );
  const complete = profileErrors(profile).length === 0;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            <span className="tiny-sun">✳</span> URMĂTORUL TĂU CAPITOL ÎNCEPE
            AICI
          </span>
          <h1>
            O prezentare deosebită.
            <br />
            <em>Greu de trecut cu vederea.</em>
          </h1>
          <p>
            Bine ai revenit, {profile.name.split(" ")[0] || "there"}. Hai să
            pregătim următoarea ta proprietate.
          </p>
        </div>
        <Link
          href={complete ? "/panou/proprietati/noua" : "/panou/profil"}
          className="button primary"
          data-guide-add-property
        >
          <Plus size={18} />
          Adaugă o proprietate
        </Link>
      </div>
      <section className="stats-grid" aria-label="Prezentarea proprietăților">
        <div className="stat-card">
          <div>
            <span>Proprietățile tale</span>
            <strong>{String(properties.length).padStart(2, "0")}</strong>
            <small>Fiecare are o poveste</small>
          </div>
          <span className="stat-icon peach">
            <Building2 size={21} />
          </span>
        </div>
        <div className="stat-card">
          <div>
            <span>Prezentări publicate{demo ? " în demo" : ""}</span>
            <strong>
              {String(published).padStart(2, "0")}
              <i className="stat-live">{demo ? "DEMO" : "LIVE"}</i>
            </strong>
            <small>
              {demo
                ? "Pregătite pentru descoperire"
                : "Pregătite pentru vizitatori"}
            </small>
          </div>
          <span className="stat-icon sage">
            <Globe2 size={21} />
          </span>
        </div>
        <div className="stat-card">
          <div>
            <span>În pregătire</span>
            <strong>
              {String(properties.length - published).padStart(2, "0")}
            </strong>
            <small>Detaliile bune cer puțină atenție</small>
          </div>
          <span className="stat-icon lavender">
            <FilePenLine size={21} />
          </span>
        </div>
      </section>
      <section className="collection-section">
        <div className="section-heading">
          <div className="section-title">
            <h2>Proprietățile mele</h2>
            <span className="count-pill">{properties.length}</span>
          </div>
          <div className="view-toggle">
            <button
              aria-label="Vizualizare grilă"
              aria-pressed={layout === "grid"}
              className={layout === "grid" ? "selected" : ""}
              onClick={() => setLayout("grid")}
            >
              <LayoutGrid size={17} />
            </button>
            <button
              aria-label="Vizualizare listă"
              aria-pressed={layout === "list"}
              className={layout === "list" ? "selected" : ""}
              onClick={() => setLayout("list")}
            >
              <List size={19} />
            </button>
          </div>
        </div>
        <div className="collection-toolbar">
          <div className="tabs" role="tablist" aria-label="Starea proprietății">
            {[
              ["all", "Toate", properties.length],
              ["published", "Publicat", published],
              ["draft", "Ciorne", properties.length - published],
            ].map(([value, label, count]) => (
              <button
                key={value}
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(String(value))}
                className={tab === value ? "active" : ""}
              >
                {label}
                <span>{count}</span>
              </button>
            ))}
          </div>
          <div className="search-tools">
            <label className="search-field">
              <Search size={16} />
              <input
                aria-label="Caută proprietăți"
                placeholder="Caută proprietăți…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button
                  aria-label="Șterge căutarea"
                  onClick={() => setQuery("")}
                >
                  <X size={13} />
                </button>
              )}
            </label>
            <button
              className={`filter-button ${filters ? "selected" : ""}`}
              aria-label="Filtrare și sortare"
              aria-expanded={filters}
              onClick={() => setFilters(!filters)}
            >
              <SlidersHorizontal size={17} />
            </button>
          </div>
        </div>
        {filters && (
          <div className="filter-panel">
            <label>
              Tipul proprietății
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="all">Toate tipurile</option>
                {["House", "Condo", "Penthouse"].map((t) => (
                  <option key={t} value={t}>
                    {propertyTypeLabel(t)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Sortează după
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="recent">Cele mai noi</option>
                <option value="price">Preț descrescător</option>
                <option value="name">Nume: A–Z</option>
              </select>
            </label>
            <button
              className="text-button"
              onClick={() => {
                setType("all");
                setSort("recent");
                setQuery("");
              }}
            >
              Resetează filtrele
            </button>
          </div>
        )}
        {visible.length ? (
          <div
            className={`property-grid ${layout === "list" ? "list-layout" : ""}`}
          >
            {visible.map((p) => (
              <PropertyCard key={p.id} property={p} demo={demo} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <Building2 size={35} />
            <h3>
              {properties.length
                ? "Nu am găsit proprietăți."
                : "O nouă poveste începe aici."}
            </h3>
            <p>
              {properties.length
                ? "Încearcă altă căutare sau modifică filtrele."
                : "Adaugă prima proprietate și creează o prezentare memorabilă."}
            </p>
            {!properties.length && (
              <Link
                className="button primary"
                href={complete ? "/panou/proprietati/noua" : "/panou/profil"}
              >
                <Plus size={16} />
                Începe aici
              </Link>
            )}
          </div>
        )}
      </section>
      <section className="design-strip">
        <div className="design-strip-copy">
          <span className="eyebrow">
            TREI STILURI. NENUMĂRATE POSIBILITĂȚI.
          </span>
          <h2>
            Fiecare locuință merită
            <br />o primă impresie <em>deosebită.</em>
          </h2>
          <p>
            Tu aduci proprietatea.
            <br />
            Noi pregătim prezentarea.
          </p>
          <Link href="/panou/modele">
            Descoperă colecția <ArrowUpRight size={17} />
          </Link>
        </div>
        <div className="design-strip-templates">
          {templates.map((t) => (
            <Link href={`/modele/${t.id}`} key={t.id}>
              <TemplateMiniature template={t.id} />
              <div className="design-strip-caption">
                <span>{t.name}</span>
                <ArrowUpRight size={14} />
              </div>
            </Link>
          ))}
        </div>
      </section>
      <div className="video-teaser">
        <span className="video-teaser-icon">
          <Megaphone size={21} />
        </span>
        <div>
          <strong>Proprietatea ta, în căutările potrivite.</strong>
          <span>
            Promovează site-ul proprietății în Google Search, cu un buget ales
            de tine.
          </span>
        </div>
        <Link href="/panou/promovare">
          Vezi pachetele de promovare <ArrowRight size={16} />
        </Link>
      </div>
    </>
  );
}
