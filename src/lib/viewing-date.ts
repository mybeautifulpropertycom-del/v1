/** Date-only values never pass through the visitor's UTC offset. */
export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function viewingDateLabel(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

export function validViewingDate(
  value: unknown,
  now = new Date(),
): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    return false;
  const utcToday = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const day = 86_400_000;
  // Allow the current local day anywhere in the world at UTC date boundaries.
  // This is a preferred calendar date, not a reserved appointment or time slot.
  return (
    parsed.getTime() >= utcToday - day &&
    parsed.getTime() < utcToday + 367 * day
  );
}
