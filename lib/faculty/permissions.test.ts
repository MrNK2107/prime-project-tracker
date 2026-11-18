import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { canEditEvent } from "@/lib/faculty/permissions";
import type { Scope } from "@/lib/faculty/scope";

const scope = (coordinator: boolean): Scope => ({ mentees: ["m1"], groups: [{ id: "g", name: "G", studentIds: ["s1", "s2"], coordinator }], departments: [], placement: false });
const ev = (mine: boolean, ...students: string[]) => ({ mine, participants: students.map((studentId) => ({ studentId })) }) as never;

describe("canEditEvent", () => {
  it("lets the creator edit", () => expect(canEditEvent(ev(true, "x"), scope(false))).toBe(true));
  it("lets a coordinator edit an event that reaches the group", () => expect(canEditEvent(ev(false, "s1", "z"), scope(true))).toBe(true));
  it("does not let an ordinary group lead edit someone else's event", () => expect(canEditEvent(ev(false, "s1"), scope(false))).toBe(false));
  it("does not let a coordinator edit an event that only reaches other students", () => expect(canEditEvent(ev(false, "z"), scope(true))).toBe(false));
});
