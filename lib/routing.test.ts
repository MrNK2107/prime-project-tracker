import { describe, it, expect } from "vitest";
import { homeFor, resolveRedirect, isAllowedEmail } from "@/lib/routing";

describe("homeFor", () => {
  it("maps each role to its home", () => {
    expect(homeFor("student")).toBe("/student");
    expect(homeFor("faculty")).toBe("/faculty");
    expect(homeFor("admin")).toBe("/admin");
    expect(homeFor("principal")).toBe("/overview");
  });
});

describe("resolveRedirect", () => {
  it("sends null sessions to /login from protected pages", () => {
    expect(resolveRedirect("/student", null)).toBe("/login");
    expect(resolveRedirect("/", null)).toBe("/login");
    expect(resolveRedirect("/admin/users", null)).toBe("/login");
  });
  it("lets null sessions reach /login and the auth callback", () => {
    expect(resolveRedirect("/login", null)).toBeNull();
    expect(resolveRedirect("/auth/callback", null)).toBeNull();
  });
  it("sends signed-in users from / and /login to their home", () => {
    expect(resolveRedirect("/", { role: "faculty" })).toBe("/faculty");
    expect(resolveRedirect("/login", { role: "principal" })).toBe("/overview");
  });
  it("keeps users inside their own section", () => {
    expect(resolveRedirect("/student/inbox", { role: "student" })).toBeNull();
    expect(resolveRedirect("/faculty", { role: "student" })).toBe("/student");
    expect(resolveRedirect("/admin", { role: "faculty" })).toBe("/faculty");
    expect(resolveRedirect("/overview", { role: "admin" })).toBe("/admin");
  });
  it("does not match sections by bare prefix", () => {
    expect(resolveRedirect("/studentship", { role: "faculty" })).toBe("/faculty");
  });
});

describe("isAllowedEmail", () => {
  it("accepts the exact domain, case-insensitively", () => {
    expect(isAllowedEmail("a@college.edu", "college.edu")).toBe(true);
    expect(isAllowedEmail("A@College.EDU", "college.edu")).toBe(true);
    expect(isAllowedEmail(" a@college.edu ", "college.edu")).toBe(true);
  });
  it("rejects other domains, lookalikes and malformed input", () => {
    expect(isAllowedEmail("a@gmail.com", "college.edu")).toBe(false);
    expect(isAllowedEmail("a@evil-college.edu", "college.edu")).toBe(false);
    expect(isAllowedEmail("a@college.edu.evil.com", "college.edu")).toBe(false);
    expect(isAllowedEmail("a@b@college.edu", "college.edu")).toBe(false);
    expect(isAllowedEmail("college.edu", "college.edu")).toBe(false);
  });
  it("rejects everything when no domain is configured", () => {
    expect(isAllowedEmail("a@college.edu", undefined)).toBe(false);
    expect(isAllowedEmail("a@college.edu", "")).toBe(false);
  });
});
