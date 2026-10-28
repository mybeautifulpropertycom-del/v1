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
          <span className="eyebrow">YOUR PROPERTIES, IN MOTION</span>
          <h1>
            A story worth <em>watching.</em>
          </h1>
          <p>
            One cinematic walkthrough, included with each property package.
            Follow your film from your website editor.
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
                    ? "YOUR PROPERTY FILM"
                    : "BRING YOUR PROPERTY TO LIFE"}
                </span>
                <h2>{property.title || "Your next property"}</h2>
                <p>
                  {property.status === "published"
                    ? "Open your website editor to view your cinematic walkthrough or follow its progress."
                    : "Publish property to generate video. Turn your saved photographs into a presentation that helps buyers imagine being there."}
                </p>
                <Link
                  className="button primary"
                  href={`/preview/${property.id}${property.status === "published" ? "#film" : ""}`}
                >
                  {property.status === "published"
                    ? "View website & video"
                    : "Publish Property"}
                  <ArrowUpRight size={16} />
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <Film size={35} />
          <h2>Your next story starts with a property.</h2>
          <p>
            Add the details and photographs, then preview your website before
            publishing.
          </p>
          <Link className="button primary" href="/dashboard/properties/new">
            <Plus size={16} />
            Add a property
          </Link>
        </div>
      )}
    </>
  );
}
