import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { activeOn, todayIso, type DatedLink } from "@/lib/links";

/**
 * What a faculty member is responsible for right now, one capacity at a time. A person can be a mentor,
 * a group lead and a head of department together, but each capacity stays separate: a group lead's
 * group is not their department, and heading a department says nothing about mentees.
 */
export type Scope = {
  mentees: string[]; // student ids
  groups: { id: string; name: string; studentIds: string[]; coordinator: boolean }[]; // groups they lead
  departments: { id: string; name: string; studentIds: string[] }[]; // departments they head
  placement: boolean; // hackathon and placement coordinator: sees every student and can post to anyone
};

type Row = Record<string, unknown>;
const str = (v: unknown) => String(v ?? "");
const live = (rows: Row[], today: string) => rows.filter((r) => activeOn(r as unknown as DatedLink, today));

export const EMPTY_SCOPE: Scope = { mentees: [], groups: [], departments: [], placement: false };

export async function getMyScope(): Promise<Scope> {
  const sb = await createServerClient();
  const { data: auth } = await sb.auth.getUser();
  const me = auth?.user?.id;
  if (!me) return EMPTY_SCOPE;

  const [mentorships, leads, hods, groups, departments, groupMembers, memberships, placement] = await Promise.all([
    sb.from("mentorships").select("student_id, valid_from, valid_to").eq("mentor_id", me),
    sb.from("group_leads").select("group_id, valid_from, valid_to, is_coordinator").eq("faculty_id", me),
    sb.from("hod_assignments").select("department_id, valid_from, valid_to").eq("faculty_id", me),
    sb.from("groups").select("id, name"),
    sb.from("departments").select("id, name"),
    sb.from("group_members").select("student_id, group_id, valid_from, valid_to"),
    sb.from("department_memberships").select("student_id, department_id, valid_from, valid_to"),
    sb.from("placement_coordinators").select("valid_from, valid_to").eq("faculty_id", me),
  ]);
  if ([mentorships, leads, hods, groups, departments, groupMembers, memberships, placement].some((r) => r.error)) return EMPTY_SCOPE;

  const today = todayIso();
  const activeLeads = live(leads.data as Row[], today);
  const ledIds = new Set(activeLeads.map((l) => str(l.group_id)));
  const coordinatorIds = new Set(activeLeads.filter((l) => l.is_coordinator === true).map((l) => str(l.group_id)));
  const headedIds = new Set(live(hods.data as Row[], today).map((h) => str(h.department_id)));
  const members = live(groupMembers.data as Row[], today);
  const deptMembers = live(memberships.data as Row[], today);

  return {
    placement: live(placement.data as Row[], today).length > 0,
    mentees: live(mentorships.data as Row[], today).map((m) => str(m.student_id)),
    groups: (groups.data as Row[])
      .filter((g) => ledIds.has(str(g.id)))
      .map((g) => ({ id: str(g.id), name: str(g.name), studentIds: members.filter((m) => str(m.group_id) === str(g.id)).map((m) => str(m.student_id)), coordinator: coordinatorIds.has(str(g.id)) })),
    departments: (departments.data as Row[])
      .filter((d) => headedIds.has(str(d.id)))
      .map((d) => ({ id: str(d.id), name: str(d.name), studentIds: deptMembers.filter((m) => str(m.department_id) === str(d.id)).map((m) => str(m.student_id)) })),
  };
}

export function hasAnyScope(s: Scope): boolean {
  return s.placement || s.mentees.length > 0 || s.groups.length > 0 || s.departments.length > 0;
}

/** Why the caller sees a student: the capacities (mentor, group lead, HOD) that cover them. */
export function relationsOf(scope: Scope, studentId: string): string[] {
  const out: string[] = [];
  if (scope.mentees.includes(studentId)) out.push("Mentee");
  if (scope.placement && out.length === 0) out.push("Placement");
  for (const g of scope.groups) if (g.studentIds.includes(studentId)) out.push(`Group: ${g.name}`);
  for (const d of scope.departments) if (d.studentIds.includes(studentId)) out.push(`Dept: ${d.name}`);
  return out;
}

export type AudienceTab = { id: string; label: string; ids: Set<string> | null }; // ids null = no narrowing

/**
 * The audience filter, in priority order: your mentees, your groups, your departments, then everyone you can see.
 * The first tab is the default. A person with a single capacity gets just that tab; the "all" tab appears for a
 * placement coordinator (every student) or when there is more than one capacity to choose between.
 */
export function audienceTabs(s: Scope): AudienceTab[] {
  const tabs: AudienceTab[] = [];
  if (s.mentees.length) tabs.push({ id: "mentees", label: "My mentees", ids: new Set(s.mentees) });
  for (const g of s.groups) tabs.push({ id: `g-${g.id}`, label: `Group: ${g.name}`, ids: new Set(g.studentIds) });
  for (const d of s.departments) tabs.push({ id: `d-${d.id}`, label: `Dept: ${d.name}`, ids: new Set(d.studentIds) });
  if (s.placement || tabs.length !== 1) tabs.push({ id: "all", label: s.placement ? "All students" : "Everyone", ids: null });
  return tabs;
}

/** Students in groups the caller coordinates: the people whose results and events they have full authority over. */
export function coordinatedStudentIds(s: Scope): Set<string> {
  return new Set(s.groups.filter((g) => g.coordinator).flatMap((g) => g.studentIds));
}
