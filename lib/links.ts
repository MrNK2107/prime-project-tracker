/** Shared rules for dated relationship links (same as the database: active through valid_to inclusive). */
export type DatedLink = { valid_from: string; valid_to: string | null };

/** Today as YYYY-MM-DD in UTC, which is what the hosted database's current_date uses. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function activeOn(link: DatedLink, today: string): boolean {
  return link.valid_from <= today && (link.valid_to === null || link.valid_to >= today);
}
