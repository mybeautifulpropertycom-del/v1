"use client";
import Link from "next/link";
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
            "Your page descriptions are ready. Review them in place, then save your website.",
          );
        })
        .catch((error) => {
          if (active)
            setError(
              error instanceof Error
                ? error.message
                : "Your page descriptions could not be prepared.",
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
          : { ...property, [field]: value },
      );
      setError("");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "This text could not be updated.",
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
      notify("Your website changes are saved.");
      return value;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Your changes could not be saved.",
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
        <h1>This preview isn’t available.</h1>
        <p>Save your property first, then open the preview.</p>
        <Link href="/dashboard" className="button primary">
          Back to properties
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
              ? "Click any highlighted section text to edit it."
              : "Make it yours, right on the page."}
            {editing && property.status === "published" && (
              <small>Saving updates your published website.</small>
            )}
          </span>
        </div>
        <div>
          <Link
            className="text-button"
            href={`/dashboard/properties/${id}`}
            onClick={(e) => {
              if (dirty && !confirm("Leave without saving your changes?"))
                e.preventDefault();
            }}
          >
            Property details
          </Link>
          {editing ? (
            <>
              <button
                className="button secondary"
                disabled={busy || preparing}
                onClick={() => {
                  if (!dirty || confirm("Discard your unsaved changes?")) {
                    setProperty(savedProperty);
                    setDirty(false);
                    setEditing(false);
                    setError("");
                  }
                }}
              >
                Done editing
              </button>
              <button
                className="button primary"
                disabled={busy || preparing || !dirty}
                onClick={save}
              >
                <Save size={14} />
                {busy ? "Saving…" : "Save website"}
              </button>
            </>
          ) : (
            <button
              className="button secondary"
              disabled={preparing}
              onClick={() => setEditing(true)}
            >
              <Pencil size={14} />
              Edit on page
            </button>
          )}
          {property.status === "published" ? (
            <Link
              className="button primary"
              href={demo ? `/preview/${id}` : publicPath(property)}
              target="_blank"
              rel="noopener noreferrer"
            >
              View live website <ExternalLink size={15} />
            </Link>
          ) : (
            <button
              className="button primary"
              disabled={busy || preparing}
              onClick={() => void publication.publish()}
            >
              <Globe2 size={16} />
              Publish Property
            </button>
          )}
        </div>
      </div>
      {publication.dialog}
      {preparing && (
        <div className="inline-notice" role="status">
          Preparing the descriptions for your page…
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
              Try again
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
