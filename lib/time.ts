/** The college is in India: form times are entered, and shown, in IST (Asia/Kolkata, UTC+05:30). */
export const TIME_ZONE = "Asia/Kolkata";

/** Turns a datetime-local value ("2026-11-20T10:30") into an ISO string with the IST offset, or null when blank. */
export function istInputToIso(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) throw new Error("Enter a valid date and time.");
  const iso = `${v}:00+05:30`;
  if (Number.isNaN(new Date(iso).getTime())) throw new Error("Enter a valid date and time.");
  return iso;
}

/** Turns an ISO instant into a datetime-local value ("2026-11-20T10:30") in IST, or "" when absent. */
export function isoToIstInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(iso)).map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: TIME_ZONE }).format(new Date(iso));
}

export function formatDay(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: TIME_ZONE }).format(new Date(iso));
}
