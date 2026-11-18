import "server-only";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/session";
import { isAllowedEmail } from "@/lib/routing";
import { isRegisterNo, normalizeRegisterNo, passwordProblem } from "@/lib/identifier";

/**
 * Admin operations. Not marked "use server" on purpose: these are plain server functions that the
 * form actions in app/(app)/admin/ call, so they are never directly invokable from the browser.
 *
 * Two layers of protection: every function first checks the session is an active admin, and then
 * the database enforces it again (row-level security and the admin_* functions in 0006_admin_ops.sql),
 * all using the admin's own session. Only creating the sign-in account itself uses the service key.
 * Every change is audited by the database triggers.
 */

export type AssignableRole = "student" | "faculty";

async function requireAdmin() {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "admin") throw new Error("Only an admin can do this.");
  return profile;
}

async function call(fn: string, args: Record<string, unknown>) {
  await requireAdmin();
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message || "The change could not be saved.");
  return data;
}

/**
 * Creates a sign-in account (email + initial password) plus its profile. Students also need a register
 * number, which they can sign in with. Roles admin and principal can never be created here.
 */
export async function createUser(
  email: string,
  fullName: string,
  role: AssignableRole,
  password: string,
  registerNo?: string,
): Promise<string> {
  await requireAdmin();
  if (role !== "student" && role !== "faculty") throw new Error("Only student and faculty roles can be created here.");
  const cleanEmail = email.trim().toLowerCase();
  const name = fullName.trim();
  if (!isAllowedEmail(cleanEmail, process.env.ALLOWED_EMAIL_DOMAIN)) throw new Error("Use a college email address.");
  if (!name) throw new Error("Enter the person's name.");
  const pwProblem = passwordProblem(password);
  if (pwProblem) throw new Error(pwProblem);
  let reg: string | null = null;
  if (role === "student") {
    if (!registerNo || !isRegisterNo(registerNo)) throw new Error("Enter the student's register number (letters, digits, / or -).");
    reg = normalizeRegisterNo(registerNo);
  }

  const { data, error } = await createServiceClient().auth.admin.createUser({ email: cleanEmail, password, email_confirm: true });
  if (error || !data?.user) {
    if (error && (error.code === "email_exists" || /already/i.test(error.message))) {
      throw new Error("That email already has an account.");
    }
    throw new Error("The account could not be created.");
  }
  const id = data.user.id;

  const supabase = await createServerClient();
  const { error: profileError } = await supabase
    .from("profiles")
    .insert({ id, email: cleanEmail, full_name: name, role, register_no: reg });
  if (profileError) {
    // No half-made account: remove the sign-in user again.
    await createServiceClient().auth.admin.deleteUser(id);
    if (profileError.code === "23505") throw new Error("That register number is already in use.");
    throw new Error("The account could not be created.");
  }
  return id;
}

/** Sets a new password for a student or faculty account (the admin hands it over in person). */
export async function resetPassword(userId: string, password: string): Promise<void> {
  const me = await requireAdmin();
  const pwProblem = passwordProblem(password);
  if (pwProblem) throw new Error(pwProblem);
  if (userId === me.id) throw new Error("Use Change password for your own account.");
  // Read with the admin's own session; only student and faculty accounts may be matched.
  const supabase = await createServerClient();
  const { data } = await supabase.from("profiles").select("id").eq("id", userId).in("role", ["student", "faculty"]).maybeSingle();
  if (!data) throw new Error("This account cannot be changed.");
  const { error } = await createServiceClient().auth.admin.updateUserById(userId, { password });
  if (error) throw new Error("The password could not be changed.");
}

/** Turns an account on or off. Deactivated users are locked out at once (every query returns nothing). */
export async function setActive(userId: string, active: boolean): Promise<void> {
  await requireAdmin();
  const supabase = await createServerClient();
  const { data, error } = await supabase.from("profiles").update({ active }).eq("id", userId).select("id");
  if (error) throw new Error("The account could not be updated.");
  // Row-level security hides your own account and admin/principal accounts from updates.
  if (!data || data.length === 0) throw new Error("This account cannot be changed.");
}

export async function assignMentor(mentorId: string, studentId: string): Promise<void> {
  await call("admin_assign_mentor", { p_mentor: mentorId, p_student: studentId });
}
export async function addToGroup(groupId: string, studentId: string): Promise<void> {
  await call("admin_add_to_group", { p_group: groupId, p_student: studentId });
}
export async function removeFromGroup(groupId: string, studentId: string): Promise<void> {
  await call("admin_remove_from_group", { p_group: groupId, p_student: studentId });
}
export async function assignHod(facultyId: string, departmentId: string): Promise<void> {
  await call("admin_assign_hod", { p_faculty: facultyId, p_department: departmentId });
}
export async function assignGroupLead(groupId: string, facultyId: string): Promise<void> {
  await call("admin_assign_group_lead", { p_group: groupId, p_faculty: facultyId });
}
export async function removeGroupLead(groupId: string, facultyId: string): Promise<void> {
  await call("admin_remove_group_lead", { p_group: groupId, p_faculty: facultyId });
}
export async function moveDepartment(studentId: string, departmentId: string): Promise<void> {
  await call("admin_move_department", { p_student: studentId, p_department: departmentId });
}
export async function setStudentYear(studentId: string, year: number): Promise<void> {
  await call("admin_set_student_year", { p_student: studentId, p_year: year });
}
/** Moves active students up one year (one department, or all). Returns how many were updated. */
export async function promoteYear(departmentId?: string): Promise<number> {
  const n = await call("admin_promote_year", { p_department: departmentId ?? null });
  return Number(n ?? 0);
}

/** Reference data the admin adds directly (admins may insert these; no other role can). */
export async function createDepartment(name: string): Promise<void> {
  await requireAdmin();
  const clean = name.trim();
  if (!clean) throw new Error("Enter a name.");
  const { error } = await (await createServerClient()).from("departments").insert({ name: clean });
  if (error) throw new Error(error.code === "23505" ? "That department already exists." : "The department could not be created.");
}
export async function createGroup(name: string): Promise<void> {
  await requireAdmin();
  const clean = name.trim();
  if (!clean) throw new Error("Enter a name.");
  const { error } = await (await createServerClient()).from("groups").insert({ name: clean });
  if (error) throw new Error(error.code === "23505" ? "That group already exists." : "The group could not be created.");
}
