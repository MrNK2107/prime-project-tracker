/**
 * How a student's results for one invitation are presented. Shared by the faculty profile and the
 * student screens. "Sealed" means confirmed and counting; "claimed" means submitted but not
 * confirmed yet; they must never be mixed (spec anti-goal).
 */
export type ResultRow = {
  id: string;
  invitation_id: string;
  revision: number;
  outcome: string;
  details: string | null;
  proof_path?: string | null;
  status: "submitted" | "sent_back" | "confirmed" | "superseded";
  review_note: string | null;
  submitted_at: string;
};

export type ResultState = "sealed" | "claimed" | "sent_back";

export type ResultView = {
  id: string;
  revision: number;
  outcome: string;
  details: string | null;
  state: ResultState;
  note: string | null;
  submittedAt: string;
  hasProof: boolean;
};

function view(r: ResultRow): ResultView {
  return {
    id: r.id,
    revision: r.revision,
    outcome: r.outcome,
    details: r.details,
    state: r.status === "confirmed" ? "sealed" : r.status === "sent_back" ? "sent_back" : "claimed",
    note: r.review_note,
    submittedAt: r.submitted_at,
    hasProof: Boolean(r.proof_path),
  };
}

/**
 * Picks what counts and what is pending from every revision of one invitation's result.
 * A confirmed row keeps counting while a later correction waits for review.
 */
export function summarizeResults(rows: ResultRow[]): { result: ResultView | null; pendingCorrection: ResultView | null } {
  const live = rows.filter((r) => r.status !== "superseded").sort((a, b) => b.revision - a.revision);
  if (live.length === 0) return { result: null, pendingCorrection: null };
  const confirmed = live.find((r) => r.status === "confirmed");
  const latest = live[0];
  if (confirmed) {
    return { result: view(confirmed), pendingCorrection: latest.revision > confirmed.revision ? view(latest) : null };
  }
  return { result: view(latest), pendingCorrection: null };
}
