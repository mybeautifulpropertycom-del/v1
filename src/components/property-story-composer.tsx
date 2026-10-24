"use client";

import { useState } from "react";
import { LoaderCircle, Sparkles } from "lucide-react";
import type { Property } from "@/lib/model";
import { getSupabase } from "@/lib/supabase";
import {
  parseStoryDraft,
  propertyStorySource,
  savedPropertyStory,
  storyFields,
  type StoryDraft,
  type StoryField,
} from "@/lib/property-story";

export function PropertyStoryComposer({
  property,
  demo,
  saved,
  dirty,
  locked,
  onApply,
}: {
  property: Property;
  demo: boolean;
  saved: boolean;
  dirty: boolean;
  locked: boolean;
  onApply: (value: Property) => void;
}) {
  const [draft, setDraft] = useState<StoryDraft | null>(null);
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const savedCopy = savedPropertyStory(property);
  const changed = Boolean(draft && source !== propertyStorySource(property));

  async function generate() {
    const supabase = getSupabase();
    if (!supabase || demo || !saved || dirty || locked || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Please sign in again to create a story.");
      const response = await fetch("/api/property-story", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ propertyId: property.id }),
        signal: AbortSignal.timeout(60000),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Your story could not be created.");
      const value = parseStoryDraft(result.draft, property.images.length);
      if (!value || typeof result.source !== "string")
        throw new Error("Your story could not be read. Please try again.");
      setDraft(value);
      setSource(result.source);
      setMessage(
        "Your story is ready to review. Nothing has been saved or published.",
      );
    } catch (e) {
      setError(
        e instanceof Error && e.name !== "TimeoutError"
          ? e.message
          : "This is taking longer than expected. Please try again shortly.",
      );
    } finally {
      setBusy(false);
    }
  }
  function apply() {
    if (!draft || changed || locked) return;
    const valid = parseStoryDraft(draft, property.images.length);
    if (!valid) {
      setError("Complete every text field before applying your story.");
      return;
    }
    const next = { ...property, description: valid.description };
    onApply({
      ...next,
      website_copy: {
        version: 1,
        source: propertyStorySource(next),
        content: valid.content,
      },
    });
    setDraft(null);
    setError("");
    setMessage(
      "Story applied to your editor. Save changes to update your website.",
    );
  }

  return (
    <section
      className="form-card property-story-composer"
      aria-labelledby="property-story-title"
    >
      <div className="form-section-title">
        <Sparkles size={20} />
        <h2 id="property-story-title">A story of its own.</h2>
      </div>
      <p className="form-intro">
        Turn your photographs and property details into a personal introduction,
        website headings, and photo captions. Review every word before using it.
      </p>
      <p className="story-service-note">
        Your saved details and photos are shared with our AI writing service
        when you generate a story. Your price, measurements, and amenities stay
        as you entered them.
      </p>
      {property.website_copy && !savedCopy && (
        <p className="inline-notice">
          The property details or photos have changed. The website is using your
          current listing details until you generate a fresh story.
        </p>
      )}
      <div className="story-composer-actions">
        <button
          type="button"
          className="button dark"
          disabled={
            demo || busy || locked || dirty || !saved || !property.images.length
          }
          onClick={generate}
        >
          {busy ? (
            <LoaderCircle size={16} className="spin" />
          ) : (
            <Sparkles size={16} />
          )}
          {busy
            ? "Reading your photographs…"
            : savedCopy
              ? "Generate a fresh story"
              : "Create my property story"}
        </button>
        {savedCopy && !draft && (
          <button
            type="button"
            className="button secondary"
            disabled={busy || locked}
            onClick={() => {
              setDraft({
                description: property.description,
                content: savedCopy,
              });
              setSource(propertyStorySource(property));
              setError("");
              setMessage("");
            }}
          >
            Edit website story
          </button>
        )}
      </div>
      {demo ? (
        <p className="story-service-note">
          Photo analysis is available in a connected agent workspace. This demo
          does not send photographs for analysis.
        </p>
      ) : !saved || dirty ? (
        <p className="story-service-note">
          Save your changes before generating a story.
        </p>
      ) : !property.images.length ? (
        <p className="story-service-note">
          Add and save your photographs to get started.
        </p>
      ) : (
        <p className="story-service-note">
          Up to five stories per day. Each story uses all{" "}
          {property.images.length} saved photographs.
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="inline-notice" role="status">
          {message}
        </p>
      )}
      {draft && (
        <div className="story-review">
          <h3>Make it yours.</h3>
          <p>
            Check that the wording matches the property. You can edit every
            field below.
          </p>
          {changed && (
            <p className="form-error" role="alert">
              The property has changed since this story was created. Save your
              changes and generate a fresh story before applying it.
            </p>
          )}
          <label>
            Property description
            <textarea
              rows={8}
              maxLength={12000}
              value={draft.description}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
            />
          </label>
          <details open>
            <summary>Website headings and introductions</summary>
            <div className="field-grid">
              {(Object.keys(storyFields) as StoryField[]).map((key) => (
                <label
                  key={key}
                  className={
                    storyFields[key].max > 100 ? "full-width" : undefined
                  }
                >
                  {storyFields[key].label}
                  {storyFields[key].max > 100 ? (
                    <textarea
                      rows={3}
                      maxLength={storyFields[key].max}
                      value={draft.content[key]}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          content: { ...draft.content, [key]: e.target.value },
                        })
                      }
                    />
                  ) : (
                    <input
                      maxLength={storyFields[key].max}
                      value={draft.content[key]}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          content: { ...draft.content, [key]: e.target.value },
                        })
                      }
                    />
                  )}
                </label>
              ))}
            </div>
          </details>
          <details>
            <summary>Photo captions · {property.images.length}</summary>
            <div className="story-caption-list">
              {property.images.map((image, index) => (
                <label key={`${image}-${index}`}>
                  <img
                    src={image}
                    alt={`Review property photograph ${index + 1}`}
                    loading="lazy"
                  />
                  <span>
                    Photo {index + 1}
                    <input
                      maxLength={150}
                      value={draft.content.captions[index] || ""}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          content: {
                            ...draft.content,
                            captions: draft.content.captions.map(
                              (caption, i) =>
                                i === index ? e.target.value : caption,
                            ),
                          },
                        })
                      }
                    />
                  </span>
                </label>
              ))}
            </div>
          </details>
          <div className="story-composer-actions">
            <button
              type="button"
              className="button primary"
              disabled={changed || locked || busy}
              onClick={apply}
            >
              Use this story
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => {
                setDraft(null);
                setMessage("");
                setError("");
              }}
            >
              Discard suggestion
            </button>
          </div>
          <p className="story-service-note">
            Your description appears in every design. The Heritage also uses
            these headings and captions. Save changes when you’re ready
            {property.status === "published"
              ? " to update your live website"
              : ""}
            .
          </p>
        </div>
      )}
    </section>
  );
}
