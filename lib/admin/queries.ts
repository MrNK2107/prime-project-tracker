import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { activeOn, todayIso, type DatedLink as Link } from "@/lib/links";

export type Person = {
  id: string;
  email: string;
  registerNo: string | null;
  fullName: string;
  role: "student" | "faculty" | "admin" | "principal";
  active: boolean;
  year: number | null;
  department: { id: string; name: string } | null;
  mentor: { id: string; name: string } | null;
  groups: { id: string; name: string }[];
};

export type Department = { id: string; name: string; hod: { id: string; name: string } | null; students: number };
export type Group = {
  id: string;
  name: string;
  leads: { id: string; name: string }[];
  members: { id: string; name: string }[];
};

/** Everything the admin screens need, read with the admin's own session (row-level security applies). */
export async function loadAdminData() {
  const supabase = await createServerClient();
  const today = todayIso();

  const [profiles, years, memberships, mentorships, groupMembers, groupLeads, hods, departments, groups] = await Promise.all([
    supabase.from("profiles").select("id, email, register_no, full_name, role, active").order("full_name"),
    supabase.from("student_year").select("student_id, year"),
    supabase.from("department_memberships").select("student_id, department_id, valid_from, valid_to"),
    supabase.from("mentorships").select("student_id, mentor_id, valid_from, valid_to"),
    supabase.from("group_members").select("group_id, student_id, valid_from, valid_to"),
    supabase.from("group_leads").select("group_id, faculty_id, valid_from, valid_to"),
    supabase.from("hod_assignments").select("faculty_id, department_id, valid_from, valid_to"),
    supabase.from("departments").select("id, name").order("name"),
    supabase.from("groups").select("id, name").order("name"),
  ]);

  for (const r of [profiles, years, memberships, mentorships, groupMembers, groupLeads, hods, departments, groups]) {
    if (r.error) throw new Error("Could not load the admin data.");
  }

  const name = new Map((profiles.data ?? []).map((p) => [p.id as string, (p.full_name as string) || (p.email as string)]));
  const deptName = new Map((departments.data ?? []).map((d) => [d.id as string, d.name as string]));
  const groupName = new Map((groups.data ?? []).map((g) => [g.id as string, g.name as string]));
  const yearOf = new Map((years.data ?? []).map((y) => [y.student_id as string, y.year as number]));

  const deptOf = new Map<string, { id: string; name: string }>();
  for (const m of memberships.data ?? []) {
    if (activeOn(m as Link, today)) deptOf.set(m.student_id as string, { id: m.department_id as string, name: deptName.get(m.department_id as string) ?? "" });
  }
  const mentorOf = new Map<string, { id: string; name: string }>();
  for (const m of mentorships.data ?? []) {
    if (activeOn(m as Link, today)) mentorOf.set(m.student_id as string, { id: m.mentor_id as string, name: name.get(m.mentor_id as string) ?? "" });
  }
  const groupsOf = new Map<string, { id: string; name: string }[]>();
  const membersOf = new Map<string, { id: string; name: string }[]>();
  for (const m of groupMembers.data ?? []) {
    if (!activeOn(m as Link, today)) continue;
    const g = { id: m.group_id as string, name: groupName.get(m.group_id as string) ?? "" };
    groupsOf.set(m.student_id as string, [...(groupsOf.get(m.student_id as string) ?? []), g]);
    membersOf.set(g.id, [...(membersOf.get(g.id) ?? []), { id: m.student_id as string, name: name.get(m.student_id as string) ?? "" }]);
  }
  const leadsOf = new Map<string, { id: string; name: string }[]>();
  for (const l of groupLeads.data ?? []) {
    if (activeOn(l as Link, today)) leadsOf.set(l.group_id as string, [...(leadsOf.get(l.group_id as string) ?? []), { id: l.faculty_id as string, name: name.get(l.faculty_id as string) ?? "" }]);
  }
  const hodOf = new Map<string, { id: string; name: string }>();
  for (const h of hods.data ?? []) {
    if (activeOn(h as Link, today)) hodOf.set(h.department_id as string, { id: h.faculty_id as string, name: name.get(h.faculty_id as string) ?? "" });
  }

  const people: Person[] = (profiles.data ?? []).map((p) => ({
    id: p.id as string,
    email: p.email as string,
    registerNo: (p.register_no as string | null) ?? null,
    fullName: (p.full_name as string) ?? "",
    role: p.role as Person["role"],
    active: p.active as boolean,
    year: yearOf.get(p.id as string) ?? null,
    department: deptOf.get(p.id as string) ?? null,
    mentor: mentorOf.get(p.id as string) ?? null,
    groups: groupsOf.get(p.id as string) ?? [],
  }));

  const studentsIn = new Map<string, number>();
  for (const d of deptOf.values()) studentsIn.set(d.id, (studentsIn.get(d.id) ?? 0) + 1);

  return {
    people,
    departments: (departments.data ?? []).map((d): Department => ({
      id: d.id as string,
      name: d.name as string,
      hod: hodOf.get(d.id as string) ?? null,
      students: studentsIn.get(d.id as string) ?? 0,
    })),
    groups: (groups.data ?? []).map((g): Group => ({
      id: g.id as string,
      name: g.name as string,
      leads: leadsOf.get(g.id as string) ?? [],
      members: membersOf.get(g.id as string) ?? [],
    })),
  };
}
