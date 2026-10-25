"use client";
import { storyFields, type WebsiteCopyField } from "@/lib/property-story";

export type EditableField =
  "title" | "location" | "description" | `copy.${WebsiteCopyField}`;

export function EditableText({
  field,
  value,
  onEdit,
}: {
  field: EditableField;
  value: string;
  onEdit?: (field: EditableField, value: string) => void;
}) {
  if (!onEdit) return <>{value}</>;
  const copyField = field.startsWith("copy.")
    ? (field.slice(5) as WebsiteCopyField)
    : null;
  const label =
    copyField === "storyBody"
      ? "Main section description"
      : copyField
        ? storyFields[copyField].label
        : `property ${field === "title" ? "headline" : field}`;
  const multiline =
    field === "description" ||
    copyField === "storyBody" ||
    Boolean(
      copyField &&
      storyFields[copyField as keyof typeof storyFields]?.max > 100,
    );
  return (
    <span
      className="editable-text"
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label={`Edit ${label}`}
      aria-multiline={multiline}
      tabIndex={0}
      onBlur={(e) => {
        const next = (e.currentTarget.textContent || "").trim();
        // Restore the last accepted text before validating. A rejected edit
        // must not remain visible as though it were saved.
        e.currentTarget.textContent = value;
        onEdit(field, next);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !multiline) {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    >
      {value}
    </span>
  );
}
