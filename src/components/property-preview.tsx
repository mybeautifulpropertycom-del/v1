"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Pencil, Save } from "lucide-react";
import { useWorkspace } from "./workspace-provider";
import { PropertyWebsite, type EditableField } from "./property-website";
export function PropertyPreview({ id }: { id: string }) {
  const { properties, profile, saveProperty, notify } = useWorkspace();
  const savedProperty = properties.find((p) => p.id === id);
  const [property, setProperty] = useState(savedProperty);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setProperty(savedProperty);
  }, [savedProperty]);
  useEffect(() => {
    function warn(e: BeforeUnloadEvent) {
      if (dirty) e.preventDefault();
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function edit(field: EditableField, value: string) {
    setProperty((p) => (p ? { ...p, [field]: value } : p));
    setDirty(true);
  }
  async function save() {
    if (!property) return;
    setBusy(true);
    setError("");
    try {
      await saveProperty(property);
      setDirty(false);
      notify("Your website changes are saved.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Your changes could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
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
              ? "Click the headline, location, or description to edit."
              : "Make it yours, right on the page."}
            {editing && property.status === "published" && (
              <small>Saving updates your published website.</small>
            )}
          </span>
        </div>
        <div>
          {editing ? (
            <>
              <button
                className="button secondary"
                disabled={busy}
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
                disabled={busy || !dirty}
                onClick={save}
              >
                <Save size={14} />
                {busy ? "Saving…" : "Save website"}
              </button>
            </>
          ) : (
            <button
              className="button secondary"
              onClick={() => setEditing(true)}
            >
              <Pencil size={14} />
              Edit on page
            </button>
          )}
        </div>
      </div>
      {error && (
        <div className="inline-edit-error" role="alert">
          {error}
        </div>
      )}
      <PropertyWebsite
        property={property}
        profile={profile}
        preview
        onEdit={editing ? edit : undefined}
      />
    </>
  );
}
