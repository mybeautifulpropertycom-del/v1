"use client";
import Link from "next/link";
import { OwnerVideoDownload } from "./owner-video-download";
import { useEffect, useRef, useState } from "react";
import { Pencil, Save, Globe2, ExternalLink } from "lucide-react";
import { usePropertyPublication } from "./property-publication";
import { publicPath } from "@/lib/model";
import { useWorkspace } from "./workspace-provider";
import { PropertyWebsite, type EditableField } from "./property-website";
import {
  editWebsiteCopy,
  hasWebsiteDescriptions,
  type WebsiteCopyField,
} from "@/lib/property-story";
import { preparePropertyWebsite } from "@/lib/request-property-story";
export function PropertyPreview({ id }: { id: string }) {
  const { properties, profile, demo, saveProperty, refreshProperty, notify } =
    useWorkspace();
  const savedProperty = properties.find((p) => p.id === id);
  const [property, setProperty] = useState(savedProperty);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [error, setError] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [retry, setRetry] = useState(0);
  const attempted = useRef(new Set<string>());
  useEffect(() => {
    setProperty(savedProperty);
  }, [savedProperty]);
  useEffect(() => {
    if (
      !savedProperty ||
      demo ||
      !savedProperty.images.length ||
      savedPropertyStoryReady(savedProperty) ||
      attempted.current.has(id)
    )
      return;
    let active = true;
    // Defer until after mount; React's development effect replay cannot start a
    // second request. The client also shares concurrent requests for this input.
    const timer = setTimeout(() => {
      attempted.current.add(id);
      setPreparing(true);
      setError("");
      void preparePropertyWebsite(savedProperty)
        .then((next) => {
          if (!active) return;
          setProperty(next);
          setDirty(true);
          setEditing(true);
          notify(
            "Textele paginii sunt pregătite. Verifică-le, apoi salvează site-ul.",
          );
        })
        .catch((error) => {
          if (active)
            setError(
              error instanceof Error
                ? error.message
                : "Textele paginii nu au putut fi pregătite.",
            );
        })
        .finally(() => {
          if (active) setPreparing(false);
        });
    }, 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
    function savedPropertyStoryReady(value: NonNullable<typeof savedProperty>) {
      if (!hasWebsiteDescriptions(value)) return false;
      attempted.current.add(id);
      return true;
    }
  }, [savedProperty, demo, id, notify, retry]);
  useEffect(() => {
    function warn(e: BeforeUnloadEvent) {
      if (dirty) e.preventDefault();
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function edit(field: EditableField, value: string) {
    if (!property || preparing) return;
    try {
      setProperty(
        field.startsWith("copy.")
          ? editWebsiteCopy(property, field.slice(5) as WebsiteCopyField, value)
          : {
              ...property,
              [field]: value,
              ...(field === "location" &&
              value !== property.location &&
              property.google_place_id
                ? { google_place_id: null }
                : {}),
            },
      );
      setError("");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Textul nu a putut fi actualizat.",
      );
      return;
    }
    setDirty(true);
  }
  async function save() {
    if (!property || saving.current || preparing) return null;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      let value = await saveProperty(property);
      if (!demo && value.images.length && !hasWebsiteDescriptions(value)) {
        // Headline/location edits change the facts used by the section copy.
        // Save these inputs before asking the server to prepare their update.
        setPreparing(true);
        value = await preparePropertyWebsite(value);
        value = await saveProperty(value);
      }
      setProperty(value);
      setDirty(false);
      notify("Modificările site-ului au fost salvate.");
      return value;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Modificările nu au putut fi salvate.",
      );
      return null;
    } finally {
      setBusy(false);
      setPreparing(false);
      saving.current = false;
    }
  }
  const publication = usePropertyPublication({
    property,
    demo,
    disabled: busy || preparing,
    prepare: save,
    onPublished: async () => {
      const value = await refreshProperty(id);
      if (value) setProperty(value);
    },
    publishDemo: async () => {
      if (property) {
        const value = await saveProperty(property, true);
        setProperty(value);
      }
    },
  });
  if (!property)
    return (
      <div className="state-screen">
        <h1>Previzualizarea nu este disponibilă.</h1>
        <p>Salvează mai întâi proprietatea, apoi deschide previzualizarea.</p>
        <Link href="/panou" className="button primary">
          Înapoi la proprietăți
        </Link>
      </div>
    );
  return (
    <>
      <div className="inline-edit-toolbar">
        <div>
          <Pencil size={16} />
          <span>
            {editing
              ? "Apasă pe textul unei secțiuni evidențiate pentru a-l edita."
              : "Editează textele direct pe pagină."}
            {editing && property.status === "published" && (
              <small>Salvarea actualizează site-ul publicat.</small>
            )}
          </span>
        </div>
        <div>
          <Link
            className="text-button"
            href={`/panou/proprietati/${id}`}
            onClick={(e) => {
              if (dirty && !confirm("Pleci fără să salvezi modificările?"))
                e.preventDefault();
            }}
          >
            Detaliile proprietății
          </Link>
          {editing ? (
            <>
              <button
                className="button secondary"
                disabled={busy || preparing}
                onClick={() => {
                  if (!dirty || confirm("Renunți la modificările nesalvate?")) {
                    setProperty(savedProperty);
                    setDirty(false);
                    setEditing(false);
                    setError("");
                  }
                }}
              >
                Încheie editarea
              </button>
              <button
                className="button primary"
                disabled={busy || preparing || !dirty}
                onClick={save}
              >
                <Save size={14} />
                {busy ? "Se salvează…" : "Salvează site-ul"}
              </button>
            </>
          ) : (
            <button
              className="button secondary"
              disabled={preparing}
              onClick={() => setEditing(true)}
            >
              <Pencil size={14} />
              Editează pe pagină
            </button>
          )}
          {!demo &&
            property.status === "published" &&
            publication.film?.src && <OwnerVideoDownload propertyId={id} />}
          {property.status === "published" ? (
            <Link
              className="button primary"
              href={demo ? `/previzualizare/${id}` : publicPath(property)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Vezi site-ul publicat <ExternalLink size={15} />
            </Link>
          ) : (
            <button
              className="button primary"
              disabled={busy || preparing}
              onClick={() => void publication.publish()}
            >
              <Globe2 size={16} />
              Publică proprietatea
            </button>
          )}
        </div>
      </div>
      <div className="property-video-status-strip">
        {publication.videoStatus}
      </div>
      {publication.dialog}
      {preparing && (
        <div className="inline-notice" role="status">
          Se pregătesc textele paginii…
        </div>
      )}
      {error && (
        <div className="inline-edit-error" role="alert">
          {error}
          {!dirty && !preparing && (
            <button
              className="text-button"
              onClick={() => {
                attempted.current.delete(id);
                setRetry((value) => value + 1);
              }}
            >
              Încearcă din nou
            </button>
          )}
        </div>
      )}
      <div
        onInputCapture={(event) => {
          if ((event.target as HTMLElement).isContentEditable) setDirty(true);
        }}
      >
        <PropertyWebsite
          property={property}
          profile={profile}
          preview
          videoPanel={publication.videoPanel}
          film={publication.film}
          onEdit={editing && !preparing && !busy ? edit : undefined}
        />
      </div>
    </>
  );
}
