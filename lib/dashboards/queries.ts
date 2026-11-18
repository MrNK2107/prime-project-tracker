import "server-only";
import { cache } from "react";
import { createServerClient } from "@/lib/supabase/server";
import { currentUserId } from "@/lib/supabase/auth";
import { activeOn, todayIso, type DatedLink } from "@/lib/links";
import { buildDashboard, type CountRow, type Dashboard, type StudentInfo } from "@/lib/dashboards/aggregate";

type Row = Record<string, unknown>;
const str = (v: unknown) => String(v ?? "");

/** Departments the signed-in faculty member heads right now (empty for everyone else). */
export const myDepartments = cache(async (): Promise<{ id: string; name: string }[]> => {
  const sb = await createServerClient();
  const me = await currentUserId();
  if (!me) return [];
  const [hods, departments] = await Promise.all([
    sb.from("hod_assignments").select("department_id, valid_from, valid_to").eq("faculty_id", me),
    sb.from("departments").select("id, name"),
  ]);
  if (hods.error || departments.error) return [];
  const today = todayIso();
  const ids = new Set((hods.data as Row[]).filter((h) => activeOn(h as unknown as DatedLink, today)).map((h) => str(h.department_id)));
  return (departments.data as Row[]).filter((d) => ids.has(str(d.id))).map((d) => ({ id: str(d.id), name: str(d.name) }));
});

/** Whether the caller heads a department now: one small query, for the navigation bar shown on every page. */
export const isHeadOfDepartment = cache(async (): Promise<boolean> => {
  const me = await currentUserId();
  if (!me) return false;
  const sb = await createServerClient();
  const { data, error } = await sb.from("hod_assignments").select("valid_from, valid_to").eq("faculty_id", me);
  if (error || !data) return false;
  const today = todayIso();
  return (data as Row[]).some((h) => activeOn(h as unknown as DatedLink, today));
});

/**
 * Dashboard for the students the caller can see. With `departmentId`, only students currently in that
 * department (the head-of-department view); without it, everyone visible (the principal's view).
 */
export async function loadDashboard(departmentId?: string): Promise<Dashboard> {
  const sb = await createServerClient();
  const [profiles, years, memberships, departments, confirmed, claims] = await Promise.all([
    sb.from("profiles").select("id, email, full_name, role, active").eq("role", "student"),
    sb.from("student_year").select("student_id, year"),
    sb.from("department_memberships").select("student_id, department_id, valid_from, valid_to"),
    sb.from("departments").select("id, name"),
    sb.from("confirmed_results_by_student").select("student_id, item_type, count"),
    sb.from("unconfirmed_claims_by_student").select("student_id, item_type, count"),
  ]);
  for (const r of [profiles, years, memberships, departments, confirmed, claims]) {
    if (r.error) throw new Error("Could not load the dashboard.");
  }

  const today = todayIso();
  const yearOf = new Map((years.data as Row[]).map((y) => [str(y.student_id), Number(y.year)]));
  const deptName = new Map((departments.data as Row[]).map((d) => [str(d.id), str(d.name)]));
  const deptOf = new Map<string, string>();
  for (const m of memberships.data as Row[]) {
    if (activeOn(m as unknown as DatedLink, today)) deptOf.set(str(m.student_id), str(m.department_id));
  }

  const students: StudentInfo[] = (profiles.data as Row[])
    .filter((p) => p.active === true && (!departmentId || deptOf.get(str(p.id)) === departmentId))
    .map((p) => ({
      id: str(p.id),
      name: str(p.full_name) || str(p.email),
      department: deptOf.has(str(p.id)) ? deptName.get(deptOf.get(str(p.id))!) ?? null : null,
      year: yearOf.get(str(p.id)) ?? null,
    }));

  return buildDashboard(students, confirmed.data as CountRow[], claims.data as CountRow[]);
}
