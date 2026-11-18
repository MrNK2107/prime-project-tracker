"use server";
import { revalidatePath } from "next/cache";
import * as admin from "@/lib/admin/actions";
import type { FormResult } from "@/components/ActionForm";

/** Form-facing wrappers: turn the admin functions into { ok, message } results the screens can show. */
async function run(fn: () => Promise<string>): Promise<FormResult> {
  try {
    const message = await fn();
    revalidatePath("/admin", "layout");
    return { ok: true, message };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Something went wrong." };
  }
}

const s = (d: FormData, k: string) => String(d.get(k) ?? "").trim();

export async function createUserAction(_p: FormResult, d: FormData): Promise<FormResult> {
  return run(async () => {
    await admin.createUser(s(d, "email"), s(d, "fullName"), s(d, "role") as admin.AssignableRole, String(d.get("password") ?? ""), s(d, "registerNo"));
    return "Account created. Give them the password; they sign in with their email or register number.";
  });
}
export async function resetPasswordAction(_p: FormResult, d: FormData): Promise<FormResult> {
  return run(async () => {
    await admin.resetPassword(s(d, "userId"), String(d.get("password") ?? ""));
    return "Password changed. Give the new password to the user.";
  });
}
export async function setActiveAction(_p: FormResult, d: FormData): Promise<FormResult> {
  return run(async () => {
    const active = s(d, "active") === "true";
    await admin.setActive(s(d, "userId"), active);
    return active ? "Account reactivated." : "Account deactivated.";
  });
}
export async function assignMentorAction(_p: FormResult, d: FormData): Promise<FormResult> {
  return run(async () => {
    await admin.assignMentor(s(d, "mentorId"), s(d, "studentId"));
    return "Mentor saved.";
  });
}
export async function addToGroupAction(_p: FormResult, d: FormData): Promise<FormResult> {
  return run(async () => {
    await admin.addToGroup(s(d, "groupId"), s(d, "studentId"));
    return "Student added to the group.";
  });
}
export async function removeFromGroupAction(_p: FormResult, d: FormData): Promise<FormResult> {
  return run(async () => {
    await admin.removeFromGroup(s(d, "groupId"), s(d, "studentId"));
    return "Removed from the group.";
  });
}
export async function assignGroupLeadAction(_p: FormResult, d: FormData): Promise<FormResult> {
  return run(async () => {
    await admin.assignGroupLead(s(d, "groupId"), s(d, "facultyId"), d.get("coordinator") === "on");
    return "Group lead saved.";
  });
}
export async function assignPlacementAction(_p: FormResult, d: FormData): Promise<FormResult> {
  return run(async () => {
    await admin.assignPlacementCoordinator(s(d, "facultyId"));
    return "Hackathon and placement coordinator saved.";
  });
}
export async function removePlacementAction(_p: FormResult, d: FormData): Promise<FormResult> {
  return run(async () => {
    await admin.removePlacementCoordinator(s(d, "facultyId"));
    return "Role ended.";
  });
}
export async function removeGroupLeadAction(_p: FormResult, d: FormData): Promise<FormResult> {
  return run(async () => {
    await admin.removeGroupLead(s(d, "groupId"), s(d, "facultyId"));
    return "Group lead removed.";
  });
}
export async function assignHodAction(_p: FormResult, d: FormData): Promise<FormResult> {
  return run(async () => {
    await admin.assignHod(s(d, "facultyId"), s(d, "departmentId"));
    return "Head of department saved.";
  });
}
export async function moveDepartmentAction(_p: FormResult, d: FormData): Promise<FormResult> {
  return run(async () => {
    await admin.moveDepartment(s(d, "studentId"), s(d, "departmentId"));
    return "Department saved.";
  });
}
export async function setYearAction(_p: FormResult, d: FormData): Promise<FormResult> {
  return run(async () => {
    await admin.setStudentYear(s(d, "studentId"), Number(s(d, "year")));
    return "Year saved.";
  });
}
export async function promoteYearAction(_p: FormResult, d: FormData): Promise<FormResult> {
  return run(async () => {
    const dept = s(d, "departmentId");
    const n = await admin.promoteYear(dept || undefined);
    return n === 1 ? "1 student moved up a year." : `${n} students moved up a year.`;
  });
}
export async function createDepartmentAction(_p: FormResult, d: FormData): Promise<FormResult> {
  return run(async () => {
    await admin.createDepartment(s(d, "name"));
    return "Department created.";
  });
}
export async function createGroupAction(_p: FormResult, d: FormData): Promise<FormResult> {
  return run(async () => {
    await admin.createGroup(s(d, "name"));
    return "Group created.";
  });
}
