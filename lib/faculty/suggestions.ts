import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { isoToIstInput } from "@/lib/time";
import { safeHttpsUrl } from "@/lib/url";

/** A hackathon or internship worth considering. Not an event: nobody is invited until a faculty member posts one. */
export type Suggestion = {
  id: string;
  kind: "hackathon" | "internship";
  title: string;
  organiser: string | null;
  description: string;
  link: string | null;
  deadline: string | null;
  deadlineInput: string; // datetime-local value in IST, for prefilling the form
  priority: string | null;
};

type Row = Record<string, unknown>;
const TIER_ORDER: Record<string, number> = { "Tier S": 0, "Tier A": 1, "Tier B": 2, "Tier C": 3 };

/** Suggestions for the New event page: hackathons by nearest cutoff, then internships by the sheet's tier. Empty on any error. */
export async function listSuggestions(): Promise<Suggestion[]> {
  const sb = await createServerClient();
  const { data, error } = await sb
    .from("event_suggestions")
    .select("id, kind, title, organiser, description, link, deadline, priority")
    .limit(1000);
  if (error || !data) return [];
  const now = Date.now();
  const rows = (data as Row[])
    // A hackathon whose cutoff has passed is no longer worth suggesting.
    .filter((r) => !(r.kind === "hackathon" && r.deadline && new Date(String(r.deadline)).getTime() < now))
    .map((r): Suggestion => ({
      id: String(r.id),
      kind: r.kind === "internship" ? "internship" : "hackathon",
      title: String(r.title),
      organiser: (r.organiser as string | null) ?? null,
      description: String(r.description ?? ""),
      link: safeHttpsUrl(r.link as string | null),
      deadline: (r.deadline as string | null) ?? null,
      deadlineInput: isoToIstInput(r.deadline as string | null),
      priority: (r.priority as string | null) ?? null,
    }));
  return rows.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "hackathon" ? -1 : 1;
    if (a.kind === "hackathon") return (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999");
    return (TIER_ORDER[a.priority ?? ""] ?? 9) - (TIER_ORDER[b.priority ?? ""] ?? 9) || a.title.localeCompare(b.title);
  });
}
