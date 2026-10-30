"use client";

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
  Mail,
  MapPin,
  Plus,
  Search,
  SlidersHorizontal,
  Square,
  Video,
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
        href={`/dashboard/properties/${property.id}`}
        className="property-image"
      >
        {property.images[0] ? (
          <img
            src={property.images[0]}
            alt={property.title || "Untitled property"}
          />
        ) : (
          <span className="image-placeholder">
            <ImagePlus size={35} />
            Add your first photo
          </span>
        )}
        <span className={`status-badge ${property.status}`}>
          <span />
          {property.status === "published"
            ? demo
              ? "Published in demo"
              : "Published"
            : "Draft"}
        </span>
        <span className="image-count">
          <LayoutGrid size={12} />
          {property.images.length}
        </span>
      </Link>
      <div className="property-card-body">
        <div className="property-type">
          {property.type}
          <span>
            {property.transaction === "sale" ? "For sale" : "For rent"}
          </span>
        </div>
        <Link href={`/dashboard/properties/${property.id}`}>
          <h3>{property.title || "Untitled property"}</h3>
        </Link>
        <p className="location">
          <MapPin size={14} />
          {property.location || "Location not added"}
        </p>
        <div className="property-features">
          <span>
            <BedDouble size={15} />
            {property.bedrooms} beds
          </span>
          <span>
            <Bath size={15} />
            {property.bathrooms} baths
          </span>
          <span>
            <Square size={14} />
            {property.area.toLocaleString("en-US")}{" "}
            {property.area_unit === "sqm" ? "m²" : "sq ft"}
          </span>
        </div>
        <div className="card-price-row">
          <strong>
            {property.price ? formatPrice(property) : "Price not added"}
          </strong>
          <span className="template-label">
            {template.name.replace("The ", "")}
          </span>
        </div>
      </div>
      <div className="property-card-footer">
        <Link href={`/preview/${property.id}`}>
          <FilePenLine size={15} />
          Edit website
        </Link>
        <Link
          href={`/preview/${property.id}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Preview ${property.title} (opens in a new tab)`}
          title="Open preview in a new tab"
        >
          <ExternalLink size={15} />
        </Link>
        <DeleteAction
          label={`Delete ${property.title || "property"}`}
          confirmation={`Delete “${property.title || "Untitled property"}”? This permanently removes the property and its published page. Your leads will remain in your inbox. This cannot be undone.`}
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
        (type === "all" || p.type === type) &&
        `${p.title} ${p.location}`
          .toLocaleLowerCase("en-US")
          .includes(query.toLocaleLowerCase("en-US")),
    )
    .sort((a, b) =>
      sort === "price"
        ? b.price - a.price
        : sort === "name"
          ? a.title.localeCompare(b.title, "en-US")
          : b.created_at.localeCompare(a.created_at),
    );
  const complete = profileErrors(profile).length === 0;
  return (
    <>
      <div className="page-heading properties-heading">
        <div>
          <span className="eyebrow">
            <span className="tiny-sun">✳</span> YOUR NEXT CHAPTER STARTS HERE
          </span>
          <h1>
            Beautifully presented.
            <br />
            <em>Impossible to overlook.</em>
          </h1>
          <p>
            Welcome back, {profile.name.split(" ")[0] || "there"}. Let’s make
            someone’s next home stand out.
          </p>
        </div>
        <div className="properties-heading-actions">
          <Link
            href={complete ? "/dashboard/properties/new" : "/dashboard/profile"}
            className="button primary"
          >
            <Plus size={18} />
            Add a property
          </Link>
          <a
            href="mailto:contact@mybeautifulproperty.com"
            className="button secondary"
          >
            <Mail size={17} />
            Contact us
          </a>
        </div>
      </div>
      {!complete && (
        <Link href="/dashboard/profile" className="onboarding-callout">
          <span className="step-number">01</span>
          <div>
            <strong>First, let’s make this space yours.</strong>
            <p>
              Complete your contact details. We’ll add them to every property
              website.
            </p>
          </div>
          <ArrowRight size={22} />
        </Link>
      )}
      <section className="stats-grid" aria-label="Property overview">
        <div className="stat-card">
          <div>
            <span>Your properties</span>
            <strong>{String(properties.length).padStart(2, "0")}</strong>
            <small>Each with a story to tell</small>
          </div>
          <span className="stat-icon peach">
            <Building2 size={21} />
          </span>
        </div>
        <div className="stat-card">
          <div>
            <span>Websites {demo ? "published in demo" : "published"}</span>
            <strong>
              {String(published).padStart(2, "0")}
              <i className="stat-live">{demo ? "DEMO" : "LIVE"}</i>
            </strong>
            <small>
              {demo ? "Ready for a closer look" : "Ready to be discovered"}
            </small>
          </div>
          <span className="stat-icon sage">
            <Globe2 size={21} />
          </span>
        </div>
        <div className="stat-card">
          <div>
            <span>In the making</span>
            <strong>
              {String(properties.length - published).padStart(2, "0")}
            </strong>
            <small>Good things take a little care</small>
          </div>
          <span className="stat-icon lavender">
            <FilePenLine size={21} />
          </span>
        </div>
      </section>
      <section className="collection-section">
        <div className="section-heading">
          <div className="section-title">
            <h2>My properties</h2>
            <span className="count-pill">{properties.length}</span>
          </div>
          <div className="view-toggle">
            <button
              aria-label="Grid view"
              aria-pressed={layout === "grid"}
              className={layout === "grid" ? "selected" : ""}
              onClick={() => setLayout("grid")}
            >
              <LayoutGrid size={17} />
            </button>
            <button
              aria-label="List view"
              aria-pressed={layout === "list"}
              className={layout === "list" ? "selected" : ""}
              onClick={() => setLayout("list")}
            >
              <List size={19} />
            </button>
          </div>
        </div>
        <div className="collection-toolbar">
          <div className="tabs" role="tablist" aria-label="Property status">
            {[
              ["all", "All", properties.length],
              ["published", "Published", published],
              ["draft", "Drafts", properties.length - published],
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
                aria-label="Search properties"
                placeholder="Search properties…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button aria-label="Clear search" onClick={() => setQuery("")}>
                  <X size={13} />
                </button>
              )}
            </label>
            <button
              className={`filter-button ${filters ? "selected" : ""}`}
              aria-label="Filter and sort"
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
              Property type
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="all">All types</option>
                {["Condo", "House", "Penthouse"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label>
              Sort by
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="recent">Newest first</option>
                <option value="price">Price: high to low</option>
                <option value="name">Name: A–Z</option>
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
              Reset filters
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
                ? "No properties found."
                : "A new story starts here."}
            </h3>
            <p>
              {properties.length
                ? "Try a different search or adjust your filters."
                : "Add your first property and turn it into a memorable first impression."}
            </p>
            {!properties.length && (
              <Link
                className="button primary"
                href={
                  complete ? "/dashboard/properties/new" : "/dashboard/profile"
                }
              >
                <Plus size={16} />
                Start here
              </Link>
            )}
          </div>
        )}
      </section>
      <section className="design-strip">
        <div className="design-strip-copy">
          <span className="eyebrow">THREE STYLES. ENDLESS POSSIBILITIES.</span>
          <h2>
            Every home deserves
            <br />a beautiful <em>first impression.</em>
          </h2>
          <p>
            You bring the property.
            <br />
            We have the perfect frame.
          </p>
          <Link href="/dashboard/templates">
            Explore the collection <ArrowUpRight size={17} />
          </Link>
        </div>
        <div className="design-strip-templates">
          {templates.map((t) => (
            <Link href={`/templates/${t.id}`} key={t.id}>
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
          <Video size={21} />
        </span>
        <div>
          <strong>Your photos. Their next chapter: motion.</strong>
          <span>
            Bring your properties to life. View your videos and follow their
            progress.
          </span>
        </div>
        <Link href="/dashboard/video">
          Open video studio <ArrowRight size={16} />
        </Link>
      </div>
    </>
  );
}
