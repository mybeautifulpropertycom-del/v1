"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
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
  onSave,
}: {
  property: Property;
  demo: boolean;
  saved: boolean;
  dirty: boolean;
  locked: boolean;
  onApply: (value: Property) => void;
  onSave: () => Promise<Property | null>;
}) {
  const [draft, setDraft] = useState<StoryDraft | null>(null);
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [supportCode, setSupportCode] = useState("");
  const [status, setStatus] = useState<
    "idle" | "working" | "ready" | "error" | "applied"
  >("idle");
  const [elapsed, setElapsed] = useState(0);
  const feedback = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null);
  const savedCopy = savedPropertyStory(property);
  const changed = Boolean(draft && source !== propertyStorySource(property));
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!busy) return;
    const start = Date.now();
    setElapsed(0);
    const timer = setInterval(
      () => setElapsed(Math.floor((Date.now() - start) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [busy]);
  useEffect(() => {
    if (status !== "ready" && status !== "error") return;
    feedback.current?.scrollIntoView({
      block: "start",
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
    feedback.current?.focus({ preventScroll: true });
  }, [status]);

  async function generate() {
    const supabase = getSupabase();
    if (!supabase || demo || !saved || dirty || locked || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    setSupportCode("");
    setStatus("working");
    controller.current = new AbortController();
    let sessionTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      const {
        data: { session },
      } = await Promise.race([
        supabase.auth.getSession(),
        new Promise<never>((_, reject) => {
          sessionTimer = setTimeout(
            () =>
              reject(
                new Error(
                  "Your sign-in session did not respond. Refresh the page and sign in again.",
                ),
              ),
            8000,
          );
        }),
      ]);
      clearTimeout(sessionTimer);
      if (!session) throw new Error("Please sign in again to create a story.");
      const response = await fetch("/api/property-story", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ propertyId: property.id }),
        signal: AbortSignal.any([
          controller.current.signal,
          AbortSignal.timeout(65000),
        ]),
      });
      let result;
      try {
        result = await response.json();
      } catch {
        throw new Error(
          response.status === 504
            ? "The writing service took too long to respond. Please try again shortly."
            : "The writing service returned an unreadable response. Refresh the page and try again.",
        );
      }
      if (!response.ok) {
        const code =
          typeof result.code === "string" && /^AI_[A-Z_]+$/.test(result.code)
            ? result.code
            : "";
        const reference =
          typeof result.reference === "string" &&
          /^[a-f\d-]{36}$/i.test(result.reference)
            ? result.reference
            : "";
        setSupportCode([code, reference].filter(Boolean).join(" · "));
        throw new Error(result.error || "Your story could not be created.");
      }
      const value = parseStoryDraft(result.draft, property.images.length);
      if (!value || typeof result.source !== "string")
        throw new Error("Your story could not be read. Please try again.");
      setDraft(value);
      setSource(result.source);
      setMessage(
        "Your property copy is ready. Review it below, then choose Use this story and Save changes.",
      );
      setStatus("ready");
    } catch (e) {
      setError(
        e instanceof TypeError
          ? "We could not reach the writing service. Check your connection and try again."
          : e instanceof Error && e.name !== "TimeoutError"
            ? e.message
            : "This is taking longer than expected. Please try again shortly.",
      );
      setStatus("error");
    } finally {
      clearTimeout(sessionTimer);
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
    setStatus("applied");
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
        Two short sentences for each section, written around your photographs
        and property details. Help buyers picture the possibilities and take the
        next step with a private tour.
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
              setStatus("ready");
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
      {busy && (
        <p className="inline-notice" role="status">
          {elapsed < 25
            ? "Creating your property copy…"
            : "Still working. This can take up to a minute."}
          <span aria-hidden="true"> {elapsed}s</span>
        </p>
      )}
      <div className="story-feedback" ref={feedback} tabIndex={-1}>
        {error && (
          <p className="form-error" role="alert">
            {error}
            {supportCode && (
              <small className="story-support-code">
                Support reference: {supportCode}
              </small>
            )}
          </p>
        )}
        {message && (
          <p className="inline-notice" role="status">
            {message}
          </p>
        )}
        {draft && (
          <div className="story-review">
            <h3>Your property, in a few words.</h3>
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
                rows={3}
                maxLength={12000}
                value={draft.description}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
              />
            </label>
            <details>
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
                            content: {
                              ...draft.content,
                              [key]: e.target.value,
                            },
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
                            content: {
                              ...draft.content,
                              [key]: e.target.value,
                            },
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
        {status === "applied" && (
          <div className="story-composer-actions">
            {dirty ? (
              <button
                type="button"
                className="button primary"
                disabled={locked || busy}
                onClick={async () => {
                  const result = await onSave();
                  if (result)
                    setMessage(
                      "Your property copy is saved. Open your website preview to see it in place.",
                    );
                  else {
                    setError(
                      "Your copy is still in the editor, but could not be saved. Check the message above and try Save changes again.",
                    );
                    setStatus("error");
                  }
                }}
              >
                {locked ? "Saving…" : "Save changes"}
              </button>
            ) : (
              <Link
                className="button secondary"
                href={`/preview/${property.id}`}
                target="_blank"
              >
                Preview updated website
              </Link>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
