"use client";

export type EditableField = "title" | "location" | "description";

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
  return (
    <span
      className="editable-text"
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label={`Edit property ${field === "title" ? "headline" : field}`}
      aria-multiline={field === "description"}
      tabIndex={0}
      onBlur={(e) => onEdit(field, (e.currentTarget.textContent || "").trim())}
      onKeyDown={(e) => {
        if (e.key === "Enter" && field !== "description") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    >
      {value}
    </span>
  );
}
