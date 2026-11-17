import type { ReactNode } from "react";

// The marker is a sibling of the control, never a button nested in a label/link.
export function GuideTarget({
  id,
  children,
  field,
  issue,
  title,
  description,
  inline = false,
  className = "",
}: {
  id: string;
  children: ReactNode;
  field?: "property" | "profile";
  issue?: string | null;
  title?: string;
  description?: string;
  inline?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`guide-anchor${inline ? " guide-anchor-inline" : ""} ${className}`}
      data-guide-target={id}
      data-guide-field={field}
      data-guide-valid={field ? String(!issue) : undefined}
      data-guide-error={issue || undefined}
      data-guide-title={title}
      data-guide-description={description}
    >
      {children}
      <span className="guide-marker-slot" data-guide-slot />
    </div>
  );
}
