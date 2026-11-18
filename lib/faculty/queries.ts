import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { logEvent } from "@/lib/audit";
import { activeOn, todayIso, type DatedLink } from "@/lib/links";
import { getMyScope, coordinatedStudentIds } from "@/lib/faculty/scope";
import { fetchAll } from "@/lib/supabase/paged";
import { summarizeResults, type ResultRow, type ResultView } from "@/lib/results";

/**
 * Faculty reads. Everything goes through the caller's own session, so row-level security decides
 * which students, items and results appear; an empty list is a normal answer, never an error.
 * Queries are flat selects joined in code so they stay simple to reason about and to test.
 */

export type StudentRow = { id: string; fullName: string; email: string; registerNo: string | null; active: boolean; year: number | null; department: string | null };

export type ReviewRow = {
  resultId: string;
  studentId: string;
  studentName: string;
  itemTitle: string;
  itemType: string;
  outcome: string;
  details: string | null;
  hasProof: boolean;
  revision: number;
  isCorrection: boolean;
  submittedAt: string;
};

export type MyItem = {
  id: string;
  title: string;
  type: string;
  deadline: string | null;
  invited: number;
  joined: number;
  awaitingReview: number;
};

export type ProfileEntry = {
  invitationId: string;
  itemId: string;
  itemTitle: string;
  itemType: string;
  invitationStatus: string;
  result: ResultView | null;
  pendingCorrection: ResultView | null;
};

export type StudentProfile = {
  student: { id: string; fullName: string; email: string; registerNo: string | null; active: boolean; year: number | null; department: string | null; mentor: string | null; groups: string[] };
  entries: ProfileEntry[];
};

type Row = Record<string, unknown>;
const str = (v: unknown) => String(v ?? "");

function check(...results: { error: unknown }[]) {
  if (results.some((r) => r.error)) throw new Error("Could not load this page.");
}

export async function listVisibleStudents(): Promise<StudentRow[]> {
  const sb = await createServerClient();
  const [profiles, years, memberships, departments] = await Promise.all([
    sb.from("profiles").select("id, email, register_no, full_name, role, active").eq("role", "student").order("full_name"),
    sb.from("student_year").select("student_id, year"),
    sb.from("department_memberships").select("student_id, department_id, valid_from, valid_to"),
    sb.from("departments").select("id, name"),
  ]);
  check(profiles, years, memberships, departments);

  const today = todayIso();
  const yearOf = new Map((years.data as Row[]).map((y) => [str(y.student_id), Number(y.year)]));
  const deptName = new Map((departments.data as Row[]).map((d) => [str(d.id), str(d.name)]));
  const deptOf = new Map<string, string>();
  for (const m of memberships.data as Row[]) {
    if (activeOn(m as unknown as DatedLink, today)) deptOf.set(str(m.student_id), deptName.get(str(m.department_id)) ?? "");
  }
  return (profiles.data as Row[])
    .filter((p) => p.role === "student")
    .map((p) => ({
      id: str(p.id),
      fullName: str(p.full_name) || str(p.email),
      email: str(p.email),
      registerNo: (p.register_no as string | null) ?? null,
      active: p.active === true,
      year: yearOf.get(str(p.id)) ?? null,
      department: deptOf.get(str(p.id)) ?? null,
    }));
}

/** Submitted results the caller may confirm or send back: they created the event, are the student's mentor now, or coordinate the student's group. */
export async function listReviewQueue(): Promise<ReviewRow[]> {
  const sb = await createServerClient();
  const { data: auth } = await sb.auth.getUser();
  const me = auth?.user?.id;
  if (!me) return [];

  const [results, invitations, items, profiles, mentorships, scope] = await Promise.all([
    sb.from("results").select("id, invitation_id, revision, outcome, details, proof_path, status, submitted_at").eq("status", "submitted").order("submitted_at"),
    fetchAll((a, b) => sb.from("invitations").select("id, item_id, student_id", { count: "exact" }).order("id").range(a, b)),
    fetchAll((a, b) => sb.from("items").select("id, title, type, created_by, requires_proof", { count: "exact" }).order("id").range(a, b)),
    fetchAll((a, b) => sb.from("profiles").select("id, full_name, email, role", { count: "exact" }).order("id").range(a, b)),
    sb.from("mentorships").select("student_id, mentor_id, valid_from, valid_to").eq("mentor_id", me),
    getMyScope(),
  ]);
  check(results, invitations, items, profiles, mentorships);
  const coordinated = coordinatedStudentIds(scope);

  const today = todayIso();
  const mentees = new Set((mentorships.data as Row[]).filter((m) => activeOn(m as unknown as DatedLink, today)).map((m) => str(m.student_id)));
  const inv = new Map((invitations.data as Row[]).map((i) => [str(i.id), i]));
  const item = new Map((items.data as Row[]).map((i) => [str(i.id), i]));
  const name = new Map((profiles.data as Row[]).map((p) => [str(p.id), str(p.full_name) || str(p.email)]));

  const rows: ReviewRow[] = [];
  for (const r of results.data as Row[]) {
    const i = inv.get(str(r.invitation_id));
    const it = i ? item.get(str(i.item_id)) : undefined;
    if (!i || !it) continue;
    const studentId = str(i.student_id);
    if (str(it.created_by) !== me && !mentees.has(studentId) && !coordinated.has(studentId)) continue;
    rows.push({
      resultId: str(r.id),
      studentId,
      studentName: name.get(studentId) ?? "Student",
      itemTitle: str(it.title),
      itemType: str(it.type),
      outcome: str(r.outcome),
      details: (r.details as string | null) ?? null,
      hasProof: Boolean(r.proof_path),
      revision: Number(r.revision),
      isCorrection: Number(r.revision) > 1,
      submittedAt: str(r.submitted_at),
    });
  }
  return rows;
}

/** Items the caller created, with how many students were invited, joined, and results awaiting review. */
export async function listMyItems(): Promise<MyItem[]> {
  const sb = await createServerClient();
  const { data: auth } = await sb.auth.getUser();
  const me = auth?.user?.id;
  if (!me) return [];

  const [items, invitations, results] = await Promise.all([
    sb.from("items").select("id, title, type, deadline, created_by, created_at").eq("created_by", me).order("created_at", { ascending: false }),
    fetchAll((a, b) => sb.from("invitations").select("id, item_id, status", { count: "exact" }).order("id").range(a, b)),
    sb.from("results").select("invitation_id, status").eq("status", "submitted"),
  ]);
  check(items, invitations, results);

  const invs = invitations.data as Row[];
  const submittedInv = new Set((results.data as Row[]).map((r) => str(r.invitation_id)));
  return (items.data as Row[]).map((it) => {
    const mine = invs.filter((i) => str(i.item_id) === str(it.id));
    return {
      id: str(it.id),
      title: str(it.title),
      type: str(it.type),
      deadline: (it.deadline as string | null) ?? null,
      invited: mine.length,
      joined: mine.filter((i) => i.status === "joined").length,
      awaitingReview: mine.filter((i) => submittedInv.has(str(i.id))).length,
    };
  });
}

/** Reference data for the item form's target pickers (readable by any active user). */
export async function listTargets() {
  const sb = await createServerClient();
  const [groups, departments] = await Promise.all([sb.from("groups").select("id, name").order("name"), sb.from("departments").select("id, name").order("name")]);
  check(groups, departments);
  return {
    groups: (groups.data as Row[]).map((g) => ({ id: str(g.id), name: str(g.name) })),
    departments: (departments.data as Row[]).map((d) => ({ id: str(d.id), name: str(d.name) })),
  };
}

/**
 * One student's profile and their items/results, or null when the caller may not see them
 * (nothing is logged then). Opening a visible profile is recorded best-effort.
 */
export async function getStudentProfile(studentId: string): Promise<StudentProfile | null> {
  const sb = await createServerClient();
  const { data: p } = await sb.from("profiles").select("id, email, register_no, full_name, role, active").eq("id", studentId).maybeSingle();
  if (!p || (p as Row).role !== "student") return null;

  try {
    await logEvent("profile_open", "profile", studentId);
  } catch {
    // best effort: never block the page on the audit write
  }

  const invitations = await sb.from("invitations").select("id, item_id, student_id, status").eq("student_id", studentId);
  check(invitations);
  const invList = invitations.data as Row[];
  const invIdList = invList.map((i) => str(i.id));
  const itemIdList = [...new Set(invList.map((i) => str(i.item_id)))];

  const [years, memberships, departments, mentorships, groupMembers, groups, items, results, profiles] = await Promise.all([
    sb.from("student_year").select("student_id, year").eq("student_id", studentId),
    sb.from("department_memberships").select("student_id, department_id, valid_from, valid_to").eq("student_id", studentId),
    sb.from("departments").select("id, name"),
    sb.from("mentorships").select("student_id, mentor_id, valid_from, valid_to").eq("student_id", studentId),
    sb.from("group_members").select("student_id, group_id, valid_from, valid_to").eq("student_id", studentId),
    sb.from("groups").select("id, name"),
    sb.from("items").select("id, title, type").in("id", itemIdList),
    sb.from("results").select("id, invitation_id, revision, outcome, details, proof_path, status, review_note, submitted_at").in("invitation_id", invIdList),
    sb.from("profiles").select("id, full_name, email").eq("role", "faculty"),
  ]);
  check(years, memberships, departments, mentorships, groupMembers, groups, items, results, profiles);

  const today = todayIso();
  const deptName = new Map((departments.data as Row[]).map((d) => [str(d.id), str(d.name)]));
  const groupName = new Map((groups.data as Row[]).map((g) => [str(g.id), str(g.name)]));
  const person = new Map((profiles.data as Row[]).map((x) => [str(x.id), str(x.full_name) || str(x.email)]));
  const dept = (memberships.data as Row[]).find((m) => activeOn(m as unknown as DatedLink, today));
  const mentor = (mentorships.data as Row[]).find((m) => activeOn(m as unknown as DatedLink, today));
  const itemById = new Map((items.data as Row[]).map((i) => [str(i.id), i]));
  const invIds = new Set((invitations.data as Row[]).map((i) => str(i.id)));
  const resultsByInv = new Map<string, ResultRow[]>();
  for (const r of results.data as Row[]) {
    if (!invIds.has(str(r.invitation_id))) continue;
    const list = resultsByInv.get(str(r.invitation_id)) ?? [];
    list.push(r as unknown as ResultRow);
    resultsByInv.set(str(r.invitation_id), list);
  }

  const entries: ProfileEntry[] = (invitations.data as Row[])
    .map((i) => {
      const it = itemById.get(str(i.item_id));
      return {
        invitationId: str(i.id),
        itemId: str(i.item_id),
        itemTitle: it ? str(it.title) : "Item",
        itemType: it ? str(it.type) : "",
        invitationStatus: str(i.status),
        ...summarizeResults(resultsByInv.get(str(i.id)) ?? []),
      };
    });

  return {
    student: {
      id: studentId,
      fullName: str((p as Row).full_name) || str((p as Row).email),
      email: str((p as Row).email),
      registerNo: ((p as Row).register_no as string | null) ?? null,
      active: (p as Row).active === true,
      year: years.data && (years.data as Row[])[0] ? Number((years.data as Row[])[0].year) : null,
      department: dept ? deptName.get(str(dept.department_id)) ?? null : null,
      mentor: mentor ? person.get(str(mentor.mentor_id)) ?? null : null,
      groups: (groupMembers.data as Row[]).filter((g) => activeOn(g as unknown as DatedLink, today)).map((g) => groupName.get(str(g.group_id)) ?? ""),
    },
    entries,
  };
}
