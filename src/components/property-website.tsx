"use client";
import type { PublicProfile, PublicProperty } from "@/lib/model";
import type { EditableField } from "./website-editable-text";
import { EditorialWebsite, type PropertyFilm } from "./editorial-website";
import { HeritageWebsite } from "./heritage-website";
import { AtelierWebsite } from "./atelier-website";
export type { EditableField } from "./website-editable-text";
export type PropertyWebsiteProps = {
  property: PublicProperty;
  profile: PublicProfile;
  preview?: boolean;
  previewBackLink?: { href: string; label: string };
  sample?: boolean;
  onEdit?: (field: EditableField, value: string) => void;
  film?: PropertyFilm;
  videoPanel?: React.ReactNode;
};
export function PropertyWebsite(props: PropertyWebsiteProps) {
  if (props.property.template === "editorial")
    return <EditorialWebsite {...props} />;
  if (props.property.template === "minimal")
    return <HeritageWebsite {...props} />;
  return <AtelierWebsite {...props} />;
}
