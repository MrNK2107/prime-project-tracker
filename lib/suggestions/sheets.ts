import { readXlsx, type Cell, type Sheet } from "@/lib/suggestions/xlsx";

/** The two public Google Sheets the suggestions come from (shared as "anyone with the link"). */
export const DEFAULT_HACKATHON_SHEET = "1yviRScgZIJTPO-2woShqyuvvCg9NXlhoC3L5WfijQOQ";
export const DEFAULT_INTERNSHIP_SHEET = "15x5_TYYtm9EbhEtMbuymXNWu0JQbgiKtENd7CvC9wPM";

export type SuggestionRow = {
  source_key: string;
  kind: "hackathon" | "internship";
  title: string;
  organiser: string | null;
  description: string | null;
  link: string | null;
  deadline: string | null; // ISO with the India offset
  priority: string | null;
};

/** A sheet date as an ISO string at +05:30: text like "2026-12-05 23:59:00", or an Excel serial number. */
export function toIstIso(v: string | null): string | null {
  if (!v) return null;
  const text = /^(\d{4}-\d\d-\d\d)[ T](\d\d:\d\d)/.exec(v);
  if (text) return `${text[1]}T${text[2]}:00+05:30`;
  if (/^\d+(\.\d+)?$/.test(v) && Number(v) > 30000) {
    const d = new Date(Math.round((Number(v) - 25569) * 86400) * 1000); // the serial is a wall-clock time
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:00+05:30`;
  }
  return null;
}

const https = (u: string | null) => (u ? u.replace(/^http:\/\//i, "https://") : null);
const lines = (pairs: [string, string | null][]) => pairs.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n");

/** Header row -> column index, plus a getter for a named column of a data row. */
function table(rows: Cell[][], isHeader: (r: Cell[]) => boolean) {
  const at = rows.findIndex(isHeader);
  if (at < 0) return null;
  const head = new Map<string, number>();
  rows[at].forEach((c, i) => c.text && head.set(c.text, i));
  const get = (r: Cell[], name: string): Cell => r[head.get(name) ?? -1] ?? { text: null, link: null };
  return { data: rows.slice(at + 1), get };
}

export function hackathonRows(sheets: Sheet[], now = new Date()): SuggestionRow[] {
  const ws = sheets.find((s) => s.name.includes("All Active Directory"));
  const t = ws && table(ws.rows, (r) => r.some((c) => c.text === "Hackathon Name"));
  if (!t) return [];
  const out: SuggestionRow[] = [];
  for (const r of t.data) {
    const g = (k: string) => t.get(r, k).text;
    const title = g("Hackathon Name");
    if (!title) continue;
    const deadline = toIstIso(g("Effective Cutoff (IST)"));
    if (deadline && new Date(deadline).getTime() < now.getTime()) continue; // closed
    const reg = t.get(r, "Registration URL");
    out.push({
      source_key: `h:${g("ID") ?? title}`,
      kind: "hackathon",
      title,
      organiser: g("Organiser"),
      link: https(reg.link ?? (reg.text?.startsWith("http") ? reg.text : null)),
      deadline,
      priority: g("Event Status"),
      description: lines([["Organiser", g("Organiser")], ["When", g("Event / Finale Dates")], ["Format", g("Format")], ["Where", g("Location")], ["Eligibility", g("Eligibility")], ["Team size", g("Team Size")], ["Entry fee", g("Entry Fee")], ["Prize", g("Prize Pool (as listed)")], ["Domains", g("Domains / Tags")], ["Tech", g("Required Tech Stack")], ["About", g("Problem Statement & Requirements")], ["Note", g("Notes")]]) || null,
    });
  }
  return out;
}

export function internshipRows(sheets: Sheet[], now = new Date()): SuggestionRow[] {
  const ws = sheets[0];
  const t = ws && table(ws.rows, (r) => r.some((c) => c.text === "Date Discovered"));
  if (!t) return [];
  const out: SuggestionRow[] = [];
  for (const r of t.data) {
    const g = (k: string) => t.get(r, k).text;
    const company = g("Company Name");
    const role = g("Role Title");
    if (!company || !role) continue;
    const linkCell = t.get(r, "Application Link");
    const link = linkCell.link ?? (linkCell.text?.startsWith("http") ? linkCell.text : null);
    const deadline = toIstIso(g("Application Deadline"));
    out.push({
      source_key: `i:${company}|${role}|${link ?? ""}`,
      kind: "internship",
      title: `${company}: ${role}`.slice(0, 200),
      organiser: company,
      link: https(link),
      deadline: deadline && new Date(deadline).getTime() > now.getTime() ? deadline : null,
      priority: g("Tier"),
      description: lines([["Domain", g("Tech Domain")], ["Where", g("Location")], ["Who can apply", g("Experience Required")], ["Stipend", g("Stipend")], ["Apply by", g("Application Deadline")], ["Why it fits", g("Key Fit / Notes")]]) || null,
    });
  }
  return out;
}

/** Both sheets as suggestion rows, one per stable key (the sheets repeat a few rows). */
export function toSuggestionRows(hackathonBook: Uint8Array, internshipBook: Uint8Array, now = new Date()): SuggestionRow[] {
  const all = [...hackathonRows(readXlsx(hackathonBook), now), ...internshipRows(readXlsx(internshipBook), now)];
  return [...new Map(all.map((r) => [r.source_key, r])).values()];
}
