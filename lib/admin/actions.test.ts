import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => {
  const profilesInsert = vi.fn();
  const updateSelect = vi.fn();
  const updateEq = vi.fn(() => ({ select: updateSelect }));
  const update = vi.fn(() => ({ eq: updateEq }));
  const selectMaybeSingle = vi.fn();
  const selectIn = vi.fn(() => ({ maybeSingle: selectMaybeSingle }));
  const selectEq = vi.fn(() => ({ in: selectIn }));
  return {
    getSessionProfile: vi.fn(),
    rpc: vi.fn(),
    profilesInsert,
    updateSelect,
    updateEq,
    update,
    selectMaybeSingle,
    from: vi.fn(() => ({ insert: profilesInsert, update, select: vi.fn(() => ({ eq: selectEq })) })),
    createAuthUser: vi.fn(),
    deleteAuthUser: vi.fn(),
    updateUserById: vi.fn(),
  };
});
const { getSessionProfile, rpc, profilesInsert, updateSelect, updateEq, update, from, createAuthUser, deleteAuthUser, selectMaybeSingle, updateUserById } = m;

vi.mock("@/lib/session", () => ({ getSessionProfile: m.getSessionProfile }));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({ rpc: m.rpc, from: m.from })),
  createServiceClient: vi.fn(() => ({ auth: { admin: { createUser: m.createAuthUser, deleteUser: m.deleteAuthUser, updateUserById: m.updateUserById } } })),
}));

import {
  createUser,
  resetPassword,
  setActive,
  assignMentor,
  addToGroup,
  removeFromGroup,
  assignHod,
  assignGroupLead,
  removeGroupLead,
  moveDepartment,
  setStudentYear,
  promoteYear,
} from "@/lib/admin/actions";

const ADMIN = { id: "33333333-0000-0000-0000-000000000001", role: "admin", fullName: "Admin" };
const U1 = "11111111-0000-0000-0000-000000000001";
const U2 = "22222222-0000-0000-0000-000000000001";

beforeEach(() => {
  for (const m of [getSessionProfile, rpc, profilesInsert, updateSelect, updateEq, update, from, createAuthUser, deleteAuthUser]) m.mockClear();
  getSessionProfile.mockResolvedValue(ADMIN);
  rpc.mockResolvedValue({ data: null, error: null });
  profilesInsert.mockResolvedValue({ error: null });
  updateSelect.mockResolvedValue({ data: [{ id: U1 }], error: null });
  createAuthUser.mockResolvedValue({ data: { user: { id: U1 } }, error: null });
  deleteAuthUser.mockResolvedValue({ error: null });
  updateUserById.mockReset();
  updateUserById.mockResolvedValue({ error: null });
  selectMaybeSingle.mockReset();
  process.env.ALLOWED_EMAIL_DOMAIN = "college.edu";
});

const ALL_ACTIONS: [string, () => Promise<unknown>][] = [
  ["createUser", () => createUser("a@college.edu", "A", "student", "password1", "REG001")],
  ["resetPassword", () => resetPassword(U1, "password1")],
  ["setActive", () => setActive(U1, false)],
  ["assignMentor", () => assignMentor(U2, U1)],
  ["addToGroup", () => addToGroup("g", U1)],
  ["removeFromGroup", () => removeFromGroup("g", U1)],
  ["assignHod", () => assignHod(U2, "d")],
  ["assignGroupLead", () => assignGroupLead("g", U2)],
  ["removeGroupLead", () => removeGroupLead("g", U2)],
  ["moveDepartment", () => moveDepartment(U1, "d")],
  ["setStudentYear", () => setStudentYear(U1, 2)],
  ["promoteYear", () => promoteYear()],
];

describe("admin guard", () => {
  for (const role of ["student", "faculty", "principal"]) {
    it.each(ALL_ACTIONS)(`%s rejects a ${role} without touching the database`, async (_name, call) => {
      getSessionProfile.mockResolvedValue({ id: "x", role, fullName: "X" });
      await expect(call()).rejects.toThrow(/admin/i);
      expect(rpc).not.toHaveBeenCalled();
      expect(from).not.toHaveBeenCalled();
      expect(createAuthUser).not.toHaveBeenCalled();
    });
  }
  it.each(ALL_ACTIONS)("%s rejects a signed-out caller", async (_name, call) => {
    getSessionProfile.mockResolvedValue(null);
    await expect(call()).rejects.toThrow(/admin/i);
    expect(rpc).not.toHaveBeenCalled();
    expect(createAuthUser).not.toHaveBeenCalled();
  });
});

describe("createUser", () => {
  it("creates the auth user and the profile and returns the id", async () => {
    expect(await createUser(" Asha@College.edu ", "Asha", "student", "password1", " reg001 ")).toBe(U1);
    expect(createAuthUser).toHaveBeenCalledWith({ email: "asha@college.edu", password: "password1", email_confirm: true });
    expect(profilesInsert).toHaveBeenCalledWith({ id: U1, email: "asha@college.edu", full_name: "Asha", role: "student", register_no: "REG001" });
  });
  it.each(["admin", "principal", "root"])("refuses the role %s", async (role) => {
    await expect(createUser("a@college.edu", "A", role as never, "password1")).rejects.toThrow(/role/i);
    expect(createAuthUser).not.toHaveBeenCalled();
  });
  it("refuses an email outside the college domain", async () => {
    await expect(createUser("a@gmail.com", "A", "student", "password1", "REG001")).rejects.toThrow(/college email/i);
    expect(createAuthUser).not.toHaveBeenCalled();
  });
  it("refuses a blank name", async () => {
    await expect(createUser("a@college.edu", "   ", "student", "password1", "REG001")).rejects.toThrow(/name/i);
  });
  it("removes the auth user again when the profile insert fails", async () => {
    profilesInsert.mockResolvedValue({ error: { message: "nope" } });
    await expect(createUser("a@college.edu", "A", "faculty", "password1")).rejects.toThrow();
    expect(deleteAuthUser).toHaveBeenCalledWith(U1);
  });
  it("says so when the email already has an account", async () => {
    createAuthUser.mockResolvedValue({ data: { user: null }, error: { message: "already registered", code: "email_exists" } });
    await expect(createUser("a@college.edu", "A", "student", "password1", "REG001")).rejects.toThrow(/already/i);
    expect(profilesInsert).not.toHaveBeenCalled();
  });
});

describe("createUser passwords and register numbers", () => {
  it("refuses a short password", async () => {
    await expect(createUser("a@college.edu", "A", "faculty", "short")).rejects.toThrow(/password/i);
    expect(createAuthUser).not.toHaveBeenCalled();
  });
  it("requires a register number for students", async () => {
    await expect(createUser("a@college.edu", "A", "student", "password1", "")).rejects.toThrow(/register/i);
    await expect(createUser("a@college.edu", "A", "student", "password1", "a b")).rejects.toThrow(/register/i);
    expect(createAuthUser).not.toHaveBeenCalled();
  });
  it("gives faculty no register number", async () => {
    await createUser("f@college.edu", "F", "faculty", "password1", "REG999");
    expect(profilesInsert).toHaveBeenCalledWith(expect.objectContaining({ role: "faculty", register_no: null }));
  });
  it("says so when the register number is taken, and removes the sign-in user", async () => {
    profilesInsert.mockResolvedValue({ error: { code: "23505", message: "dup" } });
    await expect(createUser("a@college.edu", "A", "student", "password1", "REG001")).rejects.toThrow(/register number is already/i);
    expect(deleteAuthUser).toHaveBeenCalledWith(U1);
  });
});

describe("resetPassword", () => {
  it("rejects non-admins before touching anything", async () => {
    getSessionProfile.mockResolvedValue({ id: U2, role: "faculty", fullName: "F" });
    await expect(resetPassword(U1, "password1")).rejects.toThrow(/admin/i);
    expect(updateUserById).not.toHaveBeenCalled();
  });
  it("refuses a short password and the admin's own account", async () => {
    await expect(resetPassword(U1, "short")).rejects.toThrow(/password/i);
    await expect(resetPassword(ADMIN.id, "password1")).rejects.toThrow(/own account/i);
    expect(updateUserById).not.toHaveBeenCalled();
  });
  it("refuses accounts that are not student or faculty (no matching row)", async () => {
    selectMaybeSingle.mockResolvedValue({ data: null });
    await expect(resetPassword(U1, "password1")).rejects.toThrow(/cannot be changed/i);
    expect(updateUserById).not.toHaveBeenCalled();
  });
  it("sets the password for a student", async () => {
    selectMaybeSingle.mockResolvedValue({ data: { id: U1 } });
    await resetPassword(U1, "password1");
    expect(updateUserById).toHaveBeenCalledWith(U1, { password: "password1" });
  });
});

describe("setActive", () => {
  it("updates the profile", async () => {
    await setActive(U1, false);
    expect(update).toHaveBeenCalledWith({ active: false });
    expect(updateEq).toHaveBeenCalledWith("id", U1);
  });
  it("throws when no row was changed (own account, admin or principal)", async () => {
    updateSelect.mockResolvedValue({ data: [], error: null });
    await expect(setActive(ADMIN.id, false)).rejects.toThrow(/cannot be changed/i);
  });
});

describe("link actions call the matching database function", () => {
  it("assignMentor", async () => {
    await assignMentor(U2, U1);
    expect(rpc).toHaveBeenCalledWith("admin_assign_mentor", { p_mentor: U2, p_student: U1 });
  });
  it("addToGroup and removeFromGroup", async () => {
    await addToGroup("g", U1);
    await removeFromGroup("g", U1);
    expect(rpc).toHaveBeenNthCalledWith(1, "admin_add_to_group", { p_group: "g", p_student: U1 });
    expect(rpc).toHaveBeenNthCalledWith(2, "admin_remove_from_group", { p_group: "g", p_student: U1 });
  });
  it("assignHod, assignGroupLead, removeGroupLead", async () => {
    await assignHod(U2, "d");
    await assignGroupLead("g", U2);
    await removeGroupLead("g", U2);
    expect(rpc).toHaveBeenNthCalledWith(1, "admin_assign_hod", { p_faculty: U2, p_department: "d" });
    expect(rpc).toHaveBeenNthCalledWith(2, "admin_assign_group_lead", { p_group: "g", p_faculty: U2, p_coordinator: false });
    expect(rpc).toHaveBeenNthCalledWith(3, "admin_remove_group_lead", { p_group: "g", p_faculty: U2 });
  });
  it("moveDepartment and setStudentYear", async () => {
    await moveDepartment(U1, "d");
    await setStudentYear(U1, 3);
    expect(rpc).toHaveBeenNthCalledWith(1, "admin_move_department", { p_student: U1, p_department: "d" });
    expect(rpc).toHaveBeenNthCalledWith(2, "admin_set_student_year", { p_student: U1, p_year: 3 });
  });
  it("surfaces the database error message", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "this student was already placed in a department today", code: "P0001" } });
    await expect(moveDepartment(U1, "d")).rejects.toThrow(/already placed/);
  });
});

describe("promoteYear", () => {
  it("returns the number of students updated, for one department or all", async () => {
    rpc.mockResolvedValue({ data: 7, error: null });
    expect(await promoteYear("d")).toBe(7);
    expect(rpc).toHaveBeenCalledWith("admin_promote_year", { p_department: "d" });
    await promoteYear();
    expect(rpc).toHaveBeenLastCalledWith("admin_promote_year", { p_department: null });
  });
});
