"use client";
import { PropertyImage } from "./property-image";
import { MAX_PROPERTY_PHOTOS } from "@/lib/photo-limits";
import { AgentAvatar } from "./agent-avatar";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  Copy,
  ExternalLink,
  Eye,
  Globe2,
  Mail,
  Phone,
  Save,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { en } from "@/i18n/en";
import {
  createProperty,
  profileErrors,
  publicPath,
  templates,
  type Property,
  type TemplateId,
} from "@/lib/model";
import { useWorkspace } from "./workspace-provider";
import { TemplateMiniature } from "./template-miniature";
import { editWebsiteCopy, hasWebsiteDescriptions } from "@/lib/property-story";
import { preparePropertyWebsite } from "@/lib/request-property-story";

export function PropertyEditor({
  id,
  initialTemplate,
}: {
  id?: string;
  initialTemplate?: TemplateId;
}) {
  const { profile, properties, demo, saveProperty, uploadImage, notify } =
    useWorkspace();
  const router = useRouter();
  const existing = properties.find((p) => p.id === id);
  const [property, setProperty] = useState<Property>(
    () =>
      existing ?? {
        ...createProperty(profile.id),
        template: initialTemplate ?? "editorial",
      },
  );
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const saving = useRef(false);
  const pendingPublish = useRef(false);
  const [writingFailed, setWritingFailed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const uploadLock = useRef(false);
  const [uploadProgress, setUploadProgress] = useState({
    percent: 0,
    completed: 0,
    total: 0,
  });
  const [error, setError] = useState("");
  const errorBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) {
      errorBox.current?.focus({ preventScroll: true });
      errorBox.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [error]);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(Boolean(existing));
  const [published, setPublished] = useState(false);
  const [customAmenity, setCustomAmenity] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const t = en.editor;
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("checkout")) setStep(2);
  }, []);
  useEffect(() => {
    function beforeUnload(e: BeforeUnloadEvent) {
      if (dirty) e.preventDefault();
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  function update<K extends keyof Property>(key: K, value: Property[K]) {
    if (saving.current) return;
    setProperty((p) => ({ ...p, [key]: value }));
    setDirty(true);
    setPublished(false);
  }
  async function persist(
    publish = false,
    unpublish = false,
    redirect = true,
    manual = false,
  ) {
    if (saving.current || uploading) return null;
    saving.current = true;
    setBusy(true);
    setError("");
    setWritingFailed(false);
    try {
      // Save the inputs first so the server reads the owned listing, not client
      // supplied facts or image URLs. A failed generation never publishes a draft.
      let value = await saveProperty(
        unpublish ? { ...property, status: "draft" } : property,
      );
      setProperty(value);
      setDirty(false);
      setSaved(true);
      if (manual && value.description.trim()) {
        value = editWebsiteCopy(value, "storyBody", value.description);
        value = await saveProperty(value, publish);
      } else if (
        !manual &&
        !unpublish &&
        !demo &&
        value.images.length &&
        !hasWebsiteDescriptions(value)
      ) {
        setPreparing(true);
        try {
          value = await preparePropertyWebsite(value);
        } catch (error) {
          setWritingFailed(true);
          pendingPublish.current = publish;
          throw error;
        }
        setProperty(value);
        setDirty(true);
        value = await saveProperty(value, publish);
      } else if (publish) value = await saveProperty(value, true);
      setProperty(value);
      setDirty(false);
      setSaved(true);
      notify(
        unpublish
          ? t.unpublished
          : publish
            ? demo
              ? t.demoPublished
              : t.published
            : t.saved,
      );
      if (publish) setPublished(true);
      if (!id && redirect) router.replace(`/dashboard/properties/${value.id}`);
      return value;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Your property could not be saved.",
      );
      return null;
    } finally {
      setBusy(false);
      setPreparing(false);
      saving.current = false;
    }
  }
  async function goToStep(next: number) {
    if (busy || uploading) return;
    if (next === 2 && !(await persist(false, false, false))) return;
    setStep(next);
  }
  async function addFiles(files: FileList | File[] | null) {
    if (!files?.length || uploadLock.current || busy) return;
    if (property.images.length + files.length > MAX_PROPERTY_PHOTOS) {
      setError("You can add up to 40 photos per property.");
      return;
    }
    uploadLock.current = true;
    setUploadProgress({ percent: 0, completed: 0, total: files.length });
    setUploading(true);
    setError("");
    const added: string[] = [];
    try {
      for (const file of Array.from(files)) {
        const completed = added.length;
        added.push(
          await uploadImage(file, property.id, (fraction) => {
            setUploadProgress({
              percent: Math.floor(
                ((completed + fraction) / files.length) * 100,
              ),
              completed,
              total: files.length,
            });
          }),
        );
        setUploadProgress({
          percent: Math.floor((added.length / files.length) * 100),
          completed: added.length,
          total: files.length,
        });
      }
      notify(
        `${added.length} ${added.length === 1 ? "photo" : "photos"} uploaded and optimized. Save changes to keep them.`,
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "A photo could not be uploaded.",
      );
    } finally {
      if (added.length) {
        setProperty((p) => ({ ...p, images: [...p.images, ...added] }));
        setDirty(true);
      }
      uploadLock.current = false;
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  async function copyLink() {
    if (demo) {
      notify(
        "Demo websites stay in this browser. Connect Supabase to share a public link.",
      );
      return;
    }
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}${publicPath(property)}`,
      );
      notify("Your public link is copied.");
    } catch {
      setError(
        "Your browser could not copy the link. Open the published website and copy its address.",
      );
    }
  }
  function toggleAmenity(value: string) {
    update(
      "amenities",
      property.amenities.includes(value)
        ? property.amenities.filter((v) => v !== value)
        : [...property.amenities, value],
    );
  }
  if (id && !existing)
    return (
      <div className="empty-state">
        <h1>That property isn’t in your workspace.</h1>
        <Link className="button primary" href="/dashboard">
          Back to properties
        </Link>
      </div>
    );
  if (profileErrors(profile).length)
    return (
      <div className="empty-state">
        <span className="eyebrow">FIRST, A LITTLE INTRODUCTION</span>
        <h1>Let’s make it yours.</h1>
        <p>
          Add your name, phone, and email. We’ll include them on every property
          website.
        </p>
        <Link href="/dashboard/profile" className="button primary">
          Complete my profile <ArrowRight size={17} />
        </Link>
      </div>
    );
  const amenities = [
    ...new Set([
      "Private garden",
      "Pool",
      "Outdoor terrace",
      "Two-car garage",
      "Central air",
      "Chef’s kitchen",
      "Walk-in closet",
      "City views",
      "Elevator",
      "Fireplace",
      ...property.amenities,
    ]),
  ];
  return (
    <>
      <Link
        href="/dashboard"
        className="back-link"
        onClick={(e) => {
          if (dirty && !confirm(t.unsaved)) e.preventDefault();
        }}
      >
        <ArrowLeft size={15} />
        {en.common.back}
      </Link>
      <div className="page-heading compact editor-heading">
        <div>
          <span className="eyebrow">{t.eyebrow}</span>
          <h1>{id ? t.editTitle : t.newTitle}</h1>
          <p>{t.intro}</p>
        </div>
        <div className="editor-header-actions">
          {saved && !busy && (
            <Link
              className="button secondary"
              href={`/preview/${property.id}`}
              target="_blank"
            >
              <Eye size={16} />
              {en.common.preview}
            </Link>
          )}
          <button
            className="button primary"
            disabled={busy || uploading}
            onClick={() => persist()}
          >
            <Save size={16} />
            {preparing
              ? "Preparing website…"
              : busy
                ? en.common.saving
                : en.common.save}
          </button>
        </div>
      </div>
      <div className="editor-steps">
        {t.steps.map((label, index) => (
          <button
            key={label}
            disabled={busy || uploading}
            onClick={() => goToStep(index)}
            className={step === index ? "active" : ""}
          >
            <span>{index + 1}</span>
            {label}
            {index < 2 && <ChevronLeft className="step-chevron" size={16} />}
          </button>
        ))}
      </div>
      {error && (
        <div
          className="form-error editor-error"
          role="alert"
          ref={errorBox}
          tabIndex={-1}
        >
          {error}
          {writingFailed && (
            <button
              className="text-button"
              disabled={busy}
              onClick={() => persist(pendingPublish.current, false, true, true)}
            >
              Continue with my own text
            </button>
          )}
          <button
            className="icon-button"
            aria-label="Dismiss error"
            onClick={() => setError("")}
          >
            <X size={17} />
          </button>
        </div>
      )}
      {dirty && property.status === "published" && (
        <div className="inline-notice">
          This website is published. Saving applies your changes to the live
          website.
        </div>
      )}
      <div className="editor-layout">
        <fieldset className="editor-content" disabled={busy || uploading}>
          {step === 0 && (
            <>
              <section className="form-card">
                <div className="form-section-title">
                  <span>01</span>
                  <h2>{t.details}</h2>
                </div>
                <div className="field-grid">
                  <label className="full-width">
                    Property headline
                    <input
                      value={property.title}
                      maxLength={160}
                      placeholder="A home with a beautiful point of view."
                      onChange={(e) => update("title", e.target.value)}
                    />
                  </label>
                  <label className="full-width">
                    Address
                    <input
                      value={property.location}
                      maxLength={200}
                      placeholder="123 Palm Drive, Beverly Hills, CA"
                      onChange={(e) => update("location", e.target.value)}
                    />
                    <small>
                      Enter the property’s address. It appears on the website
                      and becomes its public link when you publish.
                    </small>
                  </label>
                  <label>
                    Property type
                    <select
                      value={property.type}
                      onChange={(e) =>
                        update("type", e.target.value as Property["type"])
                      }
                    >
                      {["House", "Condo", "Penthouse", "Land"].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Listing type
                    <select
                      value={property.transaction}
                      onChange={(e) =>
                        update(
                          "transaction",
                          e.target.value as Property["transaction"],
                        )
                      }
                    >
                      <option value="sale">For sale</option>
                      <option value="rent">For rent</option>
                    </select>
                  </label>
                  <label>
                    Price
                    <input
                      type="number"
                      min="0"
                      max="999999999999"
                      value={property.price || ""}
                      placeholder="1250000"
                      onChange={(e) => update("price", Number(e.target.value))}
                    />
                  </label>
                  <label>
                    Currency
                    <select
                      value={property.currency}
                      onChange={(e) =>
                        update(
                          "currency",
                          e.target.value as Property["currency"],
                        )
                      }
                    >
                      <option value="USD">USD — US Dollar</option>
                      <option value="EUR">EUR — Euro</option>
                      <option value="RON">RON — Romanian Leu</option>
                    </select>
                  </label>
                  <label>
                    Property size
                    <input
                      type="number"
                      min="0"
                      value={property.area || ""}
                      placeholder="2500"
                      onChange={(e) => update("area", Number(e.target.value))}
                    />
                  </label>
                  <label>
                    Area unit
                    <select
                      value={property.area_unit}
                      onChange={(e) =>
                        update(
                          "area_unit",
                          e.target.value as Property["area_unit"],
                        )
                      }
                    >
                      <option value="sqft">Square feet (sq ft)</option>
                      <option value="sqm">Square meters (m²)</option>
                    </select>
                  </label>
                  <label>
                    Bedrooms
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={property.bedrooms}
                      onChange={(e) =>
                        update("bedrooms", Number(e.target.value))
                      }
                    />
                  </label>
                  <label>
                    Bathrooms
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={property.bathrooms}
                      onChange={(e) =>
                        update("bathrooms", Number(e.target.value))
                      }
                    />
                  </label>
                </div>
              </section>
              <section className="form-card">
                <div className="form-section-title">
                  <span>02</span>
                  <h2>{t.description}</h2>
                </div>
                <label>
                  Description
                  <textarea
                    rows={7}
                    maxLength={12000}
                    value={property.description}
                    placeholder="What makes this home feel special? Tell the story in your own words…"
                    onChange={(e) => update("description", e.target.value)}
                  />
                  <small>
                    {property.description.length.toLocaleString("en-US")} /
                    12,000 characters. Add details you want buyers to know. When
                    you save, your photos and property details are shared with
                    our AI writing service to prepare separate website
                    descriptions. You can edit them directly on your page.
                  </small>
                </label>
                <label className="amenity-label">The little extras</label>
                <div className="amenity-options">
                  {amenities.map((v) => (
                    <button
                      key={v}
                      className={
                        property.amenities.includes(v) ? "selected" : ""
                      }
                      aria-pressed={property.amenities.includes(v)}
                      onClick={() => toggleAmenity(v)}
                    >
                      {property.amenities.includes(v) && <Check size={13} />}
                      {v}
                    </button>
                  ))}
                </div>
                <div className="custom-amenity">
                  <input
                    aria-label="Custom amenity"
                    maxLength={60}
                    placeholder="Add another feature…"
                    value={customAmenity}
                    onChange={(e) => setCustomAmenity(e.target.value)}
                  />
                  <button
                    className="button secondary"
                    disabled={
                      !customAmenity.trim() || property.amenities.length >= 30
                    }
                    onClick={() => {
                      if (!property.amenities.includes(customAmenity.trim()))
                        update("amenities", [
                          ...property.amenities,
                          customAmenity.trim(),
                        ]);
                      setCustomAmenity("");
                    }}
                  >
                    Add
                  </button>
                </div>
              </section>
            </>
          )}
          {step === 1 && (
            <section className="form-card">
              <div className="form-section-title">
                <span>02</span>
                <h2>{t.photography}</h2>
              </div>
              <p className="form-intro">
                Great photographs make the introduction. Your first photo
                becomes the cover.
              </p>
              {uploading ? (
                <div className="upload-area uploading" aria-busy="true">
                  <div
                    className="photo-upload-progress"
                    role="progressbar"
                    aria-label="Uploading photographs"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={uploadProgress.percent}
                  >
                    <svg viewBox="0 0 88 88" aria-hidden="true">
                      <circle
                        className="photo-upload-track"
                        cx="44"
                        cy="44"
                        r="38"
                      />
                      <circle
                        className="photo-upload-value"
                        cx="44"
                        cy="44"
                        r="38"
                        pathLength="100"
                        strokeDasharray="100"
                        strokeDashoffset={100 - uploadProgress.percent}
                      />
                    </svg>
                    <strong>{uploadProgress.percent}%</strong>
                  </div>
                  <strong>Preparing and uploading your photographs…</strong>
                  <p role="status">
                    {uploadProgress.completed} of {uploadProgress.total} photos
                    uploaded
                  </p>
                  <small>Optimizing as WebP. Please keep this page open.</small>
                </div>
              ) : (
                <button
                  className="upload-area"
                  disabled={uploading || busy}
                  onClick={() => fileInput.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    void addFiles(e.dataTransfer.files);
                  }}
                >
                  <span>
                    <Upload size={26} />
                  </span>
                  <strong>Drop your photos here</strong>
                  <p>or click to browse your files</p>
                  <small>
                    JPG / JPEG, PNG, WebP · Up to 10 MB each ·{" "}
                    {property.images.length}/{MAX_PROPERTY_PHOTOS} photos
                  </small>
                </button>
              )}
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                hidden
                onChange={(e) => void addFiles(e.target.files)}
              />
              <div className="image-editor-grid">
                {property.images.map((image, i) => (
                  <div className="image-editor-card" key={image}>
                    <PropertyImage
                      src={image}
                      alt={`Property photo ${i + 1}`}
                      sizes="(max-width: 640px) 45vw, 240px"
                    />
                    <span className="image-order">
                      {i === 0 ? "Cover photo" : String(i + 1).padStart(2, "0")}
                    </span>
                    <button
                      className="image-remove"
                      disabled={uploading}
                      aria-label={`Remove photo ${i + 1}`}
                      onClick={() =>
                        update(
                          "images",
                          property.images.filter((_, j) => j !== i),
                        )
                      }
                    >
                      <X size={15} />
                    </button>
                    {i > 0 && (
                      <button
                        className="make-cover"
                        disabled={uploading}
                        onClick={() =>
                          update("images", [
                            image,
                            ...property.images.filter((_, j) => j !== i),
                          ])
                        }
                      >
                        Make cover
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {property.images.length === 0 && (
                <p className="photo-tip">
                  <Sparkles size={16} />
                  Start with a wide, well-lit photograph of your property.
                </p>
              )}
            </section>
          )}
          {step === 2 && (
            <section className="form-card">
              <div className="form-section-title">
                <span>03</span>
                <h2>{t.design}</h2>
              </div>
              <p className="form-intro">
                Same property. Three different feelings. Choose the one that
                tells your story.
              </p>
              <div className="template-choices">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    className={`template-choice ${property.template === template.id ? "selected" : ""}`}
                    aria-pressed={property.template === template.id}
                    onClick={() => update("template", template.id)}
                  >
                    <TemplateMiniature
                      template={template.id}
                      image={property.images[0]}
                    />
                    <div>
                      <span>
                        <strong>{template.name}</strong>
                        <small>{template.tag}</small>
                      </span>
                      <span className="radio-circle">
                        {property.template === template.id && (
                          <Check size={14} />
                        )}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}
          <div className="editor-step-actions">
            {step > 0 ? (
              <button
                className="button secondary"
                onClick={() => setStep(step - 1)}
              >
                <ArrowLeft size={16} />
                Previous
              </button>
            ) : (
              <span />
            )}
            {step < 2 ? (
              <button
                className="button dark"
                onClick={() => goToStep(step + 1)}
              >
                {preparing
                  ? "Preparing website…"
                  : step === 0
                    ? "Add your photos"
                    : "Choose your design"}
                <ArrowRight size={17} />
              </button>
            ) : (
              <button
                className="button primary"
                disabled={busy || uploading}
                onClick={async () => {
                  const value = await persist(false, false, false);
                  if (value) router.push(`/preview/${value.id}`);
                }}
              >
                <Globe2 size={16} />
                {preparing ? "Preparing website…" : "Open website editor"}
              </button>
            )}
          </div>
        </fieldset>
        <aside className="editor-aside">
          <div className="editor-preview-card">
            <span className="eyebrow">YOUR WEBSITE, TAKING SHAPE</span>
            <TemplateMiniature
              template={property.template}
              image={property.images[0]}
            />
            <h3>{property.title || "Your next beautiful property"}</h3>
            <p>{property.location || "Somewhere worth calling home"}</p>
            <div className="editor-site-link">
              <Globe2 size={14} />
              <span>
                mybeautifulproperty.com
                {property.address_slug
                  ? publicPath(property)
                  : "/your-property-address"}
              </span>
            </div>
            {saved && !busy && (
              <Link
                href={`/preview/${property.id}`}
                target="_blank"
                className="button secondary full-button"
              >
                <Eye size={15} />
                Preview saved website
              </Link>
            )}
            {dirty && (
              <small className="unsaved-hint">
                Save your changes to update the full preview.
              </small>
            )}
          </div>
          <div className="agent-sync-card">
            <span className="eyebrow">{t.contact}</span>
            <div>
              <span className="avatar">
                <AgentAvatar profile={profile} />
              </span>
              <strong>
                {profile.name}
                <small>{profile.agency}</small>
              </strong>
              <CheckCircle2 size={17} />
            </div>
            <span>
              <Phone size={14} />
              {profile.phone}
            </span>
            <span>
              <Mail size={14} />
              {profile.email}
            </span>
            <Link href="/dashboard/profile">
              Edit contact details <ExternalLink size={12} />
            </Link>
          </div>
          {property.status === "published" && (
            <div className="published-card">
              <span>
                <CheckCircle2 size={19} />
                {demo ? "Published in demo" : "Your website is live"}
              </span>
              <p>
                {demo
                  ? "Saved in this browser. Online sharing is available once Supabase and hosting are connected."
                  : "Your next client is one link away."}
              </p>
              {!demo && (
                <>
                  <button
                    className="button secondary full-button"
                    onClick={copyLink}
                  >
                    <Copy size={14} />
                    Copy public link
                  </button>
                  <Link
                    className="text-button"
                    href={publicPath(property)}
                    target="_blank"
                  >
                    Open published website <ExternalLink size={14} />
                  </Link>
                </>
              )}
              <button
                className="unpublish-button"
                disabled={busy}
                onClick={() => persist(false, true)}
              >
                Unpublish website
              </button>
            </div>
          )}
        </aside>
      </div>
      {published && (
        <p className="inline-notice success" role="status">
          {demo ? t.demoPublished : t.published}
        </p>
      )}
    </>
  );
}
