import type { ResultState } from "@/lib/results";

/**
 * Where one student stands on one event. Derived from the invitation status and the student's
 * current result. "awaiting" (submitted, not yet confirmed) and "confirmed" are never merged.
 */
export type Stage = "no_reply" | "declined" | "joined" | "awaiting" | "sent_back" | "confirmed";

export const STAGE_LABEL: Record<Stage, string> = {
  no_reply: "No reply yet",
  declined: "Declined",
  joined: "Joined, no result yet",
  awaiting: "Awaiting confirmation",
  sent_back: "Sent back",
  confirmed: "Confirmed",
};

export function stageOf(invitationStatus: string, resultState: ResultState | null): Stage {
  if (resultState === "sealed") return "confirmed";
  if (resultState === "claimed") return "awaiting";
  if (resultState === "sent_back") return "sent_back";
  if (invitationStatus === "declined") return "declined";
  if (invitationStatus === "joined") return "joined";
  return "no_reply";
}

/** A student still owes the event something (a reply, or a result) after the reply-by date has passed. */
export function isOverdue(deadline: string | null, stage: Stage, now: Date = new Date()): boolean {
  if (!deadline) return false;
  if (new Date(deadline).getTime() >= now.getTime()) return false;
  return stage === "no_reply" || stage === "joined" || stage === "sent_back";
}

export type Funnel = {
  invited: number;
  joined: number; // said yes, including everyone further along
  submitted: number; // sent a result, whether or not confirmed
  confirmed: number;
  declined: number;
  noReply: number;
  awaiting: number;
  overdue: number;
};

export function funnelOf(rows: { stage: Stage; overdue: boolean }[]): Funnel {
  const count = (...s: Stage[]) => rows.filter((r) => s.includes(r.stage)).length;
  return {
    invited: rows.length,
    joined: count("joined", "awaiting", "sent_back", "confirmed"),
    submitted: count("awaiting", "sent_back", "confirmed"),
    confirmed: count("confirmed"),
    declined: count("declined"),
    noReply: count("no_reply"),
    awaiting: count("awaiting"),
    overdue: rows.filter((r) => r.overdue).length,
  };
}

/** Does this event need the organiser's attention right now? */
export function needsAttention(f: Funnel): boolean {
  return f.awaiting > 0 || f.overdue > 0;
}

export type EventPhase = "upcoming" | "past";

/** An event is past once its start (or, failing that, its reply-by date) has gone by. */
export function phaseOf(startsAt: string | null, deadline: string | null, now: Date = new Date()): EventPhase {
  const when = startsAt ?? deadline;
  if (!when) return "upcoming";
  return new Date(when).getTime() < now.getTime() ? "past" : "upcoming";
}

/** The day an event sits on in a calendar: its start, else its reply-by date (IST day, YYYY-MM-DD). */
export function calendarDay(startsAt: string | null, deadline: string | null): string | null {
  const when = startsAt ?? deadline;
  if (!when) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(when));
}
