import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_HACKATHON_SHEET, DEFAULT_INTERNSHIP_SHEET, toSuggestionRows } from "@/lib/suggestions/sheets";

async function download(sheetId: string): Promise<Uint8Array> {
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/export?format=xlsx`, { cache: "no-store", redirect: "follow" });
  if (!res.ok) throw new Error(`Could not read a suggestion sheet (HTTP ${res.status}). Is it still shared with "anyone with the link"?`);
  return new Uint8Array(await res.arrayBuffer());
}

export type RefreshResult = { loaded: number; hackathons: number; internships: number; removed: number };

/**
 * Re-reads both sheets and brings the event_suggestions table in line: new rows are added, changed rows updated, rows
 * that left the sheets (or whose hackathon has closed) removed. Real events are never touched. If either sheet gives
 * nothing at all, the table is left exactly as it was.
 */
export async function refreshSuggestions(now = new Date()): Promise<RefreshResult> {
  const [hackathons, internships] = await Promise.all([
    download(process.env.SUGGESTION_HACKATHON_SHEET_ID || DEFAULT_HACKATHON_SHEET),
    download(process.env.SUGGESTION_INTERNSHIP_SHEET_ID || DEFAULT_INTERNSHIP_SHEET),
  ]);
  const rows = toSuggestionRows(hackathons, internships, now);
  const nh = rows.filter((r) => r.kind === "hackathon").length;
  const ni = rows.length - nh;
  if (nh === 0 || ni === 0) throw new Error("A suggestion sheet came back empty or in an unexpected layout; nothing was changed.");

  const sb = createServiceClient();
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await sb.from("event_suggestions").upsert(rows.slice(i, i + 100), { onConflict: "source_key" });
    if (error) throw new Error(`Saving suggestions failed: ${error.message}`);
  }

  const keep = new Set(rows.map((r) => r.source_key));
  const { data: existing, error } = await sb.from("event_suggestions").select("id, source_key").limit(5000);
  if (error) throw new Error(`Reading suggestions failed: ${error.message}`);
  const stale = (existing ?? []).filter((e) => !keep.has(String(e.source_key))).map((e) => String(e.id));
  for (let i = 0; i < stale.length; i += 50) {
    const { error: delError } = await sb.from("event_suggestions").delete().in("id", stale.slice(i, i + 50));
    if (delError) throw new Error(`Removing old suggestions failed: ${delError.message}`);
  }
  return { loaded: rows.length, hackathons: nh, internships: ni, removed: stale.length };
}
