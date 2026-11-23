"use client";
import { PLATFORM_DOMAIN } from "@/lib/platform-brand";
import { propertyTypeLabel } from "@/lib/model";
import { PropertyPhotoGrid } from "./property-photo-grid";
import { propertyGuideIssues } from "@/lib/property-guide";
import { PriceInput } from "./price-input";
import { PropertySharing } from "./property-sharing";
import { PropertyAddressInput } from "./property-address-input";
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
import { ro } from "@/i18n/ro";
import {
  createProperty,
  profileErrors,
  propertyTypeOptions,
  publicPath,
  templates,
  type Property,
  type TemplateId,
} from "@/lib/model";
import { useWorkspace } from "./workspace-provider";
import { TemplateMiniature } from "./template-miniature";
import { editWebsiteCopy, hasWebsiteDescriptions } from "@/lib/property-story";
import { preparePropertyWebsite } from "@/lib/request-property-story";
import {
  propertyDetailsErrors,
  propertyStepRequirement,
} from "@/lib/property-editor-validation";

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
  const [property, setProperty] = useState<Property>(() => {
    const source = existing ?? {
      ...createProperty(profile.id),
      template: initialTemplate ?? "editorial",
    };
    const initial = {
      ...source,
      amenities: [
        ...new Set(
          source.amenities.map((value) => {
            const key = value.trim().toLowerCase();
            if (["garaj pentru două mașini", "two-car garage"].includes(key))
              return "Loc de parcare";
            if (["încălzire centrală", "central heating"].includes(key))
              return "Centrală termică";
            return value;
          }),
        ),
      ],
    };
    // Convert legacy dimensions before presenting the metric-only editor.
    return initial.area_unit === "sqft"
      ? {
          ...initial,
          area: Math.round(initial.area * 0.09290304 * 100) / 100,
          area_unit: "sqm",
        }
      : initial;
  });
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
  const t = ro.editor;
  const guideIssues = propertyGuideIssues(property);
  const stepRequirement = propertyStepRequirement(property, step);
  useEffect(() => {
    if (
      new URLSearchParams(window.location.search).has("checkout") &&
      !propertyDetailsErrors(property).length &&
      property.images.length
    )
      setStep(2);
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
      if (!id && redirect) router.replace(`/panou/proprietati/${value.id}`);
      return value;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Proprietatea nu a putut fi salvată.",
      );
      return null;
    } finally {
      setBusy(false);
      setPreparing(false);
      saving.current = false;
    }
  }
  async function goToStep(next: number) {
    if (busy || uploading || next === step) return;
    if (next > step) {
      const detailsErrors = propertyDetailsErrors(property);
      if (detailsErrors.length) {
        setStep(0);
        setError(detailsErrors.join(" "));
        return;
      }
      if (next === 2 && !property.images.length) {
        setStep(1);
        setError("Adaugă cel puțin o fotografie.");
        return;
      }
    }
    if (next === 2 && !(await persist(false, false, false))) return;
    setError("");
    setStep(next);
  }
  async function addFiles(files: FileList | File[] | null) {
    if (!files?.length || uploadLock.current || busy) return;
    if (property.images.length + files.length > MAX_PROPERTY_PHOTOS) {
      setError(
        "Poți adăuga până la 40 de fotografii pentru fiecare proprietate.",
      );
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
        `${added.length} ${added.length === 1 ? "fotografie încărcată și optimizată" : "fotografii încărcate și optimizate"}. Salvează modificările pentru a le păstra.`,
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "O fotografie nu a putut fi încărcată.",
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
        "Site-urile demo rămân în acest browser. Conectează Supabase pentru a distribui un link public.",
      );
      return;
    }
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}${publicPath(property)}`,
      );
      notify("Linkul public a fost copiat.");
    } catch {
      setError(
        "Browserul nu a putut copia linkul. Deschide site-ul publicat și copiază adresa.",
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
  function movePhoto(from: number, to: number) {
    const images = [...property.images];
    const [image] = images.splice(from, 1);
    images.splice(to, 0, image);
    update("images", images);
  }
  if (id && !existing)
    return (
      <div className="empty-state">
        <h1>Proprietatea nu se află în contul tău.</h1>
        <Link className="button primary" href="/panou">
          Înapoi la proprietăți
        </Link>
      </div>
    );
  if (profileErrors(profile).length)
    return (
      <div className="empty-state">
        <span className="eyebrow">MAI ÎNTÂI, SĂ NE CUNOAȘTEM</span>
        <h1>Completează-ți profilul.</h1>
        <p>
          Adaugă numele, telefonul și e-mailul. Le includem pe fiecare site de
          proprietate.
        </p>
        <Link href="/panou/profil" className="button primary">
          Completează profilul <ArrowRight size={17} />
        </Link>
      </div>
    );
  const amenities = [
    ...new Set([
      "Grădină privată",
      "Piscină",
      "Spa",
      "Terasă exterioară",
      "Bucătărie exterioară",
      "Loc de parcare",
      "Pod / Mansardă",
      "WiFi",
      "Supraveghere video",
      "Alarmă",
      "Balcon",
      "Video Interfon",
      "Aer Condiționat",
      "Smart TV",
      "Centrală termică",
      "Încălzire în pardoseală",
      "Panouri solare",
      "Bucătărie cu insulă",
      "Dressing",
      "Vedere spre oraș",
      "Vedere spre mare",
      "Lift",
      "Șemineu",
      ...property.amenities,
    ]),
  ];
  return (
    <>
      <Link
        href="/panou"
        className="back-link"
        onClick={(e) => {
          if (dirty && !confirm(t.unsaved)) e.preventDefault();
        }}
      >
        <ArrowLeft size={15} />
        {ro.common.back}
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
              href={`/previzualizare/${property.id}`}
              target="_blank"
            >
              <Eye size={16} />
              {ro.common.preview}
            </Link>
          )}
          <button
            className="button primary"
            disabled={busy || uploading}
            onClick={() => persist()}
          >
            <Save size={16} />
            {preparing
              ? "Se pregătește site-ul…"
              : busy
                ? ro.common.saving
                : ro.common.save}
          </button>
        </div>
      </div>
      <div
        className="editor-steps"
        data-guide-editor
        data-guide-editor-step={step}
        data-guide-property-id={property.id}
        data-guide-requirement={stepRequirement}
        data-guide-photo-count={property.images.length}
      >
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
              Continuă cu textul meu
            </button>
          )}
          <button
            className="icon-button"
            aria-label="Închide eroarea"
            onClick={() => setError("")}
          >
            <X size={17} />
          </button>
        </div>
      )}
      {dirty && property.status === "published" && (
        <div className="inline-notice">
          Site-ul este publicat. Salvarea aplică modificările pe site-ul public.
        </div>
      )}
      <div className="editor-layout">
        <fieldset className="editor-content" disabled={busy || uploading}>
          {step === 0 && (
            <>
              <section className="form-card">
                <div className="form-section-title">
                  <span>01</span>
                  <h2 data-guide-details-title>{t.details}</h2>
                </div>
                <div className="field-grid">
                  <label className="full-width">
                    Titlul proprietății
                    <input
                      data-guide-details
                      data-property-guide-field="title"
                      data-guide-issue={guideIssues.title || undefined}
                      value={property.title}
                      maxLength={160}
                      placeholder="O locuință cu o perspectivă deosebită."
                      onChange={(e) => update("title", e.target.value)}
                    />
                  </label>
                  <PropertyAddressInput
                    guideField="location"
                    guideIssue={guideIssues.location}
                    value={property.location}
                    placeId={property.google_place_id}
                    disabled={busy}
                    onChange={(location, placeId, city) => {
                      if (saving.current) return;
                      setProperty((p) => ({
                        ...p,
                        location,
                        ...(city || p.city !== undefined
                          ? { city: city ?? null }
                          : {}),
                        // Keep old installations usable until Maps is activated.
                        ...(placeId || p.google_place_id !== undefined
                          ? { google_place_id: placeId }
                          : {}),
                      }));
                      setDirty(true);
                      setPublished(false);
                    }}
                  />
                  <label>
                    Tipul proprietății
                    <select
                      data-property-guide-field="type"
                      data-guide-issue={guideIssues.type || undefined}
                      value={
                        property.type === "Town House" ? "House" : property.type
                      }
                      onChange={(e) =>
                        update("type", e.target.value as Property["type"])
                      }
                    >
                      {propertyTypeOptions.map((v) => (
                        <option key={v} value={v}>
                          {propertyTypeLabel(v)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Tipul ofertei
                    <select
                      data-property-guide-field="transaction"
                      data-guide-issue={guideIssues.transaction || undefined}
                      value={property.transaction}
                      onChange={(e) =>
                        update(
                          "transaction",
                          e.target.value as Property["transaction"],
                        )
                      }
                    >
                      <option value="sale">De vânzare</option>
                      <option value="rent">De închiriat</option>
                    </select>
                  </label>
                  <label>
                    Preț{property.transaction === "rent" ? " / lună" : ""}
                    <PriceInput
                      guideField="price"
                      guideIssue={guideIssues.price}
                      value={property.price}
                      currency={property.currency}
                      transaction={property.transaction}
                      onChange={(value) => update("price", value)}
                    />
                  </label>
                  <label>
                    Monedă
                    <select
                      data-property-guide-field="currency"
                      data-guide-issue={guideIssues.currency || undefined}
                      value={property.currency}
                      onChange={(e) =>
                        update(
                          "currency",
                          e.target.value as Property["currency"],
                        )
                      }
                    >
                      <option value="EUR">EUR — Euro</option>
                      <option value="RON">RON — Leu românesc</option>
                      {property.currency === "USD" && (
                        <option value="USD">
                          USD — Dolar american (existent)
                        </option>
                      )}
                    </select>
                  </label>
                  <label>
                    Suprafață (m²)
                    <input
                      data-property-guide-field="area"
                      data-guide-issue={guideIssues.area || undefined}
                      type="number"
                      min="0"
                      step="0.01"
                      value={property.area || ""}
                      placeholder="120"
                      onChange={(e) => update("area", Number(e.target.value))}
                    />
                  </label>
                  <label>
                    Anul de construcție
                    <input
                      type="number"
                      inputMode="numeric"
                      min="1000"
                      max="9999"
                      step="1"
                      placeholder="2010"
                      value={property.construction_year ?? ""}
                      onChange={(e) =>
                        update(
                          "construction_year",
                          e.target.value === "" ? null : e.target.valueAsNumber,
                        )
                      }
                    />
                  </label>
                  <label>
                    Dormitoare
                    <input
                      data-property-guide-field="bedrooms"
                      data-guide-issue={guideIssues.bedrooms || undefined}
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
                    Băi
                    <input
                      data-property-guide-field="bathrooms"
                      data-guide-issue={guideIssues.bathrooms || undefined}
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
                  Descriere
                  <textarea
                    data-property-guide-field="description"
                    data-guide-issue={guideIssues.description || undefined}
                    rows={7}
                    maxLength={12000}
                    value={property.description}
                    placeholder="Descrie locuința în cuvintele tale: compartimentarea, dotările, renovările recente și ce ai vrea să remarce vizitatorii…"
                    onChange={(e) => update("description", e.target.value)}
                  />
                  <small>
                    {property.description.length.toLocaleString("ro-RO")} /
                    12.000 de caractere. Aceste detalii vor ghida textele
                    fiecărei secțiuni din prezentare. La salvare, serviciul de
                    redactare folosește aceste notițe, fotografiile și detaliile
                    proprietății pentru a scrie texte clare. Notițele rămân
                    aici; poți edita textele prezentării direct pe pagină
                  </small>
                </label>
                <label className="amenity-label">Dotări și facilități</label>
                <div
                  className="guide-facilities"
                  data-property-guide-field="amenities"
                  data-guide-issue={guideIssues.amenities || undefined}
                  data-guide-empty={property.amenities.length === 0}
                >
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
                      aria-label="Dotare personalizată"
                      maxLength={60}
                      placeholder="Adaugă o dotare…"
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
                      Adaugă
                    </button>
                  </div>
                </div>
              </section>
            </>
          )}
          {step === 1 && (
            <section className="form-card">
              <div className="form-section-title">
                <span>02</span>
                <h2 data-guide-photos>{t.photography}</h2>
              </div>
              <p className="form-intro">
                Fotografiile bune fac prima impresie. Prima fotografie devine
                coperta.
              </p>
              {uploading ? (
                <div
                  className="upload-area uploading"
                  data-guide-photo-input
                  aria-busy="true"
                >
                  <div
                    className="photo-upload-progress"
                    role="progressbar"
                    aria-label="Se încarcă fotografiile"
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
                  <strong>Se pregătesc și se încarcă fotografiile…</strong>
                  <p role="status">
                    {uploadProgress.completed} din {uploadProgress.total}{" "}
                    fotografii încărcate
                  </p>
                  <small>
                    Optimizăm în format WebP. Păstrează pagina deschisă.
                  </small>
                </div>
              ) : (
                <button
                  className="upload-area"
                  data-guide-photo-input
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
                  <strong>Trage fotografiile aici</strong>
                  <p>sau apasă pentru a alege fișierele</p>
                  <small>
                    JPG / JPEG, PNG, WebP · Maximum 10 MB fiecare ·{" "}
                    {property.images.length}/{MAX_PROPERTY_PHOTOS} fotografii
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
              <PropertyPhotoGrid
                images={property.images}
                onMove={movePhoto}
                onRemove={(index) =>
                  update(
                    "images",
                    property.images.filter((_, i) => i !== index),
                  )
                }
              />
              {property.images.length === 0 && (
                <p className="photo-tip">
                  <Sparkles size={16} />
                  Începe cu o fotografie panoramică, bine luminată.
                </p>
              )}
            </section>
          )}
          {step === 2 && (
            <section className="form-card">
              <div className="form-section-title">
                <span>03</span>
                <h2 data-guide-design>{t.design}</h2>
              </div>
              <p className="form-intro">
                Aceeași proprietate. Trei stiluri diferite. Alege-l pe cel care
                spune povestea ta.
              </p>
              <div className="template-choices" data-guide-design-input>
                {templates.map((template) => (
                  <button
                    key={template.id}
                    className={`template-choice ${property.template === template.id ? "selected" : ""}`}
                    data-guide-template-choice
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
                Înapoi
              </button>
            ) : (
              <span />
            )}
            {step < 2 ? (
              <button
                className="button dark"
                data-guide-editor-next
                disabled={busy || uploading || Boolean(stepRequirement)}
                aria-describedby={
                  stepRequirement ? "editor-step-requirement" : undefined
                }
                onClick={() => goToStep(step + 1)}
              >
                {preparing
                  ? "Se pregătește site-ul…"
                  : step === 0
                    ? "Adaugă fotografiile"
                    : "Alege designul"}
                <ArrowRight size={17} />
              </button>
            ) : (
              <button
                className="button primary"
                data-guide-preview
                disabled={busy || uploading}
                onClick={async () => {
                  const value = await persist(false, false, false);
                  if (value) router.push(`/previzualizare/${value.id}`);
                }}
              >
                <Globe2 size={16} />
                {preparing
                  ? "Se pregătește site-ul…"
                  : "Deschide editorul site-ului"}
              </button>
            )}
            {step < 2 && stepRequirement && (
              <small
                id="editor-step-requirement"
                className="editor-step-requirement"
              >
                {stepRequirement}
              </small>
            )}
          </div>
        </fieldset>
        <aside className="editor-aside">
          <div className="editor-preview-card">
            <span className="eyebrow">SITE-UL TĂU PRINDE CONTUR</span>
            <TemplateMiniature
              template={property.template}
              image={property.images[0]}
            />
            <h3>{property.title || "Următoarea ta proprietate"}</h3>
            <p>{property.location || "Un loc căruia să-i spui acasă"}</p>
            <div className="editor-site-link">
              <Globe2 size={14} />
              <span>
                {PLATFORM_DOMAIN}
                {property.address_slug
                  ? publicPath(property)
                  : "/adresa-proprietatii-tale"}
              </span>
            </div>
            {saved && !busy && (
              <Link
                href={`/previzualizare/${property.id}`}
                target="_blank"
                className="button secondary full-button"
              >
                <Eye size={15} />
                Previzualizează site-ul salvat
              </Link>
            )}
            {!demo && !busy && existing?.status === "published" && (
              <PropertySharing property={existing} />
            )}
            {dirty && (
              <small className="unsaved-hint">
                Salvează modificările pentru a actualiza previzualizarea
                completă.
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
            <Link href="/panou/profil">
              Editează datele de contact <ExternalLink size={12} />
            </Link>
          </div>
          {property.status === "published" && (
            <div className="published-card">
              <span>
                <CheckCircle2 size={19} />
                {demo ? "Publicat în demo" : "Site-ul tău este publicat"}
              </span>
              <p>
                {demo
                  ? "Salvat în acest browser. Distribuirea online este disponibilă după conectarea Supabase și a găzduirii."
                  : "Următorul tău client este la un link distanță."}
              </p>
              {!demo && (
                <>
                  <button
                    className="button secondary full-button"
                    onClick={copyLink}
                  >
                    <Copy size={14} />
                    Copiază linkul public
                  </button>
                  <Link
                    className="text-button"
                    href={publicPath(property)}
                    target="_blank"
                  >
                    Deschide site-ul publicat <ExternalLink size={14} />
                  </Link>
                </>
              )}
              <button
                className="unpublish-button"
                disabled={busy}
                onClick={() => persist(false, true)}
              >
                Șterge site-ul publicat
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
