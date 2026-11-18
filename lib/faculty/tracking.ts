import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/paged";
import { currentUserId } from "@/lib/supabase/auth";
import { activeOn, todayIso, type DatedLink } from "@/lib/links";
import { summarizeResults, type ResultRow, type ResultView } from "@/lib/results";
import { funnelOf, isOverdue, stageOf, type Funnel, type Stage } from "@/lib/tracking";

/**
 * Event tracking reads. Every query runs as the caller, so row-level security decides which
 * invitations and results come back: a mentor gets their mentees, a group lead their group, a head of
 * department their department, the event's creator the students they invited. Nothing here widens that.
 */

export type Participant = {
  invitationId: string;
  studentId: string;
  name: string;
  department: string | null;
  stage: Stage;
  overdue: boolean;
  result: ResultView | null;
  pendingCorrection: ResultView | null;
  respondedAt: string | null;
};

export type EventTrack = {
  id: string;
  title: string;
  type: string;
  description: string | null;
  meetingUrl: string | null;
  startsAt: string | null;
  deadline: string | null;
  requiresConfirmation: boolean;
  requiresProof: boolean;
  createdBy: string;
  organiser: string;
  mine: boolean;
  participants: Participant[];
  funnel: Funnel;
};

type Row = Record<string, unknown>;
const str = (v: unknown) => String(v ?? "");
const orNull = (v: unknown) => (v === null || v === undefined ? null : String(v));

export type TrackingFilter = { eventId?: string; mineOnly?: boolean; studentIds?: Set<string> };

/**
 * Events the caller can see with who is where on each. `mineOnly` keeps events the caller created;
 * `studentIds` narrows each event to those students (a mentor's mentees, a department) and drops events
 * left with nobody.
 */
export async function loadEventTracking(filter: TrackingFilter = {}): Promise<EventTrack[]> {
  const sb = await createServerClient();
  const me = (await currentUserId()) ?? "";

  const itemsQ = sb.from("items").select("id, title, type, description, meeting_url, starts_at, deadline, requires_confirmation, requires_proof, created_by, created_at");
  const [items, invitations, results, profiles, memberships, departments] = await Promise.all([
    filter.eventId ? itemsQ.eq("id", filter.eventId) : itemsQ.order("created_at", { ascending: false }),
    // Invitations grow as events x students (one group event is 81 rows), so read past the API's 1000-row page cap.
    fetchAll((a, b) => {
      const q = sb.from("invitations").select("id, item_id, student_id, status, responded_at", { count: "exact" });
      return (filter.eventId ? q.eq("item_id", filter.eventId) : q).order("id").range(a, b);
    }),
    fetchAll((a, b) => sb.from("results").select("id, invitation_id, revision, outcome, details, proof_path, status, review_note, submitted_at", { count: "exact" }).order("id").range(a, b)),
    fetchAll((a, b) => sb.from("profiles").select("id, full_name, email, role, active", { count: "exact" }).order("id").range(a, b)),
    fetchAll((a, b) => sb.from("department_memberships").select("student_id, department_id, valid_from, valid_to", { count: "exact" }).order("id").range(a, b)),
    sb.from("departments").select("id, name"),
  ]);
  for (const r of [items, invitations, results, profiles, memberships, departments]) {
    if (r.error) throw new Error("Could not load events.");
  }

  const today = todayIso();
  const now = new Date();
  const name = new Map((profiles.data as Row[]).map((p) => [str(p.id), str(p.full_name) || str(p.email)]));
  // Deactivated students are out of the picture: they do not count in any tracking number.
  const inactive = new Set((profiles.data as Row[]).filter((p) => p.role === "student" && p.active !== true).map((p) => str(p.id)));
  const deptName = new Map((departments.data as Row[]).map((d) => [str(d.id), str(d.name)]));
  const deptOf = new Map<string, string>();
  for (const m of memberships.data as Row[]) {
    if (activeOn(m as unknown as DatedLink, today)) deptOf.set(str(m.student_id), deptName.get(str(m.department_id)) ?? "");
  }
  const resultsByInv = new Map<string, ResultRow[]>();
  for (const r of results.data as Row[]) {
    const list = resultsByInv.get(str(r.invitation_id)) ?? [];
    list.push(r as unknown as ResultRow);
    resultsByInv.set(str(r.invitation_id), list);
  }
  const invsByItem = new Map<string, Row[]>();
  for (const i of invitations.data as Row[]) {
    const list = invsByItem.get(str(i.item_id)) ?? [];
    list.push(i);
    invsByItem.set(str(i.item_id), list);
  }

  const out: EventTrack[] = [];
  for (const it of items.data as Row[]) {
    if (filter.mineOnly && str(it.created_by) !== me) continue;
    const deadline = orNull(it.deadline);
    let participants: Participant[] = (invsByItem.get(str(it.id)) ?? []).filter((i) => !inactive.has(str(i.student_id))).map((i) => {
      const summary = summarizeResults(resultsByInv.get(str(i.id)) ?? []);
      const stage = stageOf(str(i.status), summary.result?.state ?? null);
      return {
        invitationId: str(i.id),
        studentId: str(i.student_id),
        name: name.get(str(i.student_id)) ?? "Student",
        department: deptOf.get(str(i.student_id)) ?? null,
        stage,
        overdue: isOverdue(deadline, stage, now),
        result: summary.result,
        pendingCorrection: summary.pendingCorrection,
        respondedAt: orNull(i.responded_at),
      };
    });
    if (filter.studentIds) {
      participants = participants.filter((p) => filter.studentIds!.has(p.studentId));
      if (participants.length === 0) continue;
    }
    // An event whose only invitees are deactivated students has nothing to track (unless it is yours: you may still be setting it up).
    if (participants.length === 0 && str(it.created_by) !== me && (invsByItem.get(str(it.id)) ?? []).length > 0) continue;
    participants.sort((a, b) => a.name.localeCompare(b.name));
    out.push({
      id: str(it.id),
      title: str(it.title),
      type: str(it.type),
      description: orNull(it.description),
      meetingUrl: orNull(it.meeting_url),
      startsAt: orNull(it.starts_at),
      deadline,
      requiresConfirmation: it.requires_confirmation === true,
      requiresProof: it.requires_proof === true,
      createdBy: str(it.created_by),
      organiser: name.get(str(it.created_by)) ?? "Faculty",
      mine: str(it.created_by) === me,
      participants,
      funnel: funnelOf(participants),
    });
  }
  return out;
}

export async function getEventTracking(eventId: string): Promise<EventTrack | null> {
  return (await loadEventTracking({ eventId }))[0] ?? null;
}

export type StudentProgress = { studentId: string; joined: number; awaiting: number; confirmed: number; noReply: number; overdue: number; total: number };

/** Per-student totals across every event the caller can see them in. */
export function progressByStudent(events: EventTrack[]): Map<string, StudentProgress> {
  const m = new Map<string, StudentProgress>();
  for (const e of events) {
    for (const p of e.participants) {
      const row = m.get(p.studentId) ?? { studentId: p.studentId, joined: 0, awaiting: 0, confirmed: 0, noReply: 0, overdue: 0, total: 0 };
      row.total += 1;
      if (p.stage === "joined") row.joined += 1;
      if (p.stage === "awaiting") row.awaiting += 1;
      if (p.stage === "confirmed") row.confirmed += 1;
      if (p.stage === "no_reply") row.noReply += 1;
      if (p.overdue) row.overdue += 1;
      m.set(p.studentId, row);
    }
  }
  return m;
}

/** Narrows already-loaded events to some students, recomputing each event's numbers; events left empty drop out. */
export function narrowEvents(events: EventTrack[], studentIds: Set<string> | null): EventTrack[] {
  if (!studentIds) return events;
  const out: EventTrack[] = [];
  for (const e of events) {
    const participants = e.participants.filter((p) => studentIds.has(p.studentId));
    if (participants.length === 0) continue;
    out.push({ ...e, participants, funnel: funnelOf(participants) });
  }
  return out;
}

export type StudentEvent = { eventId: string; title: string; type: string; stage: Participant["stage"]; overdue: boolean };

/** Student-wise view: for each student, every event they are in with where they stand on it. */
export function eventsByStudent(events: EventTrack[]): Map<string, StudentEvent[]> {
  const m = new Map<string, StudentEvent[]>();
  for (const e of events) {
    for (const p of e.participants) {
      const list = m.get(p.studentId) ?? [];
      list.push({ eventId: e.id, title: e.title, type: e.type, stage: p.stage, overdue: p.overdue });
      m.set(p.studentId, list);
    }
  }
  return m;
}
