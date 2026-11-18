import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockSupabase } from "@/tests/helpers/mockSupabase";

const m = vi.hoisted(() => ({ client: null as unknown, logEvent: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: vi.fn(async () => m.client) }));
vi.mock("@/lib/audit", () => ({ logEvent: m.logEvent }));

import { listVisibleStudents, listReviewQueue, getStudentProfile, listMyItems } from "@/lib/faculty/queries";

const ME = "22222222-0000-0000-0000-000000000001";
const S1 = "11111111-0000-0000-0000-000000000001";
const S2 = "11111111-0000-0000-0000-000000000002";
const FAR = "9999-12-31";

function use(tables: Record<string, Record<string, unknown>[]>) {
  const mock = mockSupabase(tables, ME);
  m.client = mock.client;
  return mock;
}

beforeEach(() => m.logEvent.mockReset());

describe("a faculty member with no links", () => {
  it("gets an empty list of students and an empty review queue, not an error", async () => {
    use({ profiles: [], student_year: [], department_memberships: [], departments: [], results: [], invitations: [], items: [], mentorships: [] });
    expect(await listVisibleStudents()).toEqual([]);
    expect(await listReviewQueue()).toEqual([]);
    expect(await listMyItems()).toEqual([]);
  });
});

describe("listVisibleStudents", () => {
  it("returns active and inactive students the database allowed, with department and year", async () => {
    use({
      profiles: [
        { id: S1, email: "a@c.edu", full_name: "Asha", role: "student", active: true },
        { id: ME, email: "m@c.edu", full_name: "Meena", role: "faculty", active: true },
      ],
      student_year: [{ student_id: S1, year: 2 }],
      department_memberships: [{ student_id: S1, department_id: "d1", valid_from: "2020-01-01", valid_to: null }],
      departments: [{ id: "d1", name: "CSE" }],
    });
    expect(await listVisibleStudents()).toEqual([
      { id: S1, fullName: "Asha", email: "a@c.edu", registerNo: null, active: true, year: 2, department: "CSE" },
    ]);
  });
  it("ignores an ended department link", async () => {
    use({
      profiles: [{ id: S1, email: "a@c.edu", full_name: "Asha", role: "student", active: true }],
      student_year: [],
      department_memberships: [{ student_id: S1, department_id: "d1", valid_from: "2020-01-01", valid_to: "2020-12-31" }],
      departments: [{ id: "d1", name: "CSE" }],
    });
    expect((await listVisibleStudents())[0].department).toBeNull();
  });
});

describe("listReviewQueue", () => {
  const base = {
    profiles: [
      { id: S1, full_name: "Asha", role: "student" },
      { id: S2, full_name: "Karthik", role: "student" },
    ],
    invitations: [
      { id: "i1", item_id: "it1", student_id: S1 },
      { id: "i2", item_id: "it2", student_id: S2 },
    ],
    items: [
      { id: "it1", title: "Hackathon", type: "hackathon", created_by: "someone-else", requires_proof: true },
      { id: "it2", title: "Internship", type: "internship", created_by: ME, requires_proof: false },
    ],
    results: [
      { id: "r1", invitation_id: "i1", revision: 1, outcome: "Won", details: null, proof_path: "x", status: "submitted", submitted_at: "2026-11-01T00:00:00Z" },
      { id: "r2", invitation_id: "i2", revision: 2, outcome: "Offer", details: "d", proof_path: null, status: "submitted", submitted_at: "2026-11-02T00:00:00Z" },
      { id: "r3", invitation_id: "i2", revision: 1, outcome: "old", details: null, proof_path: null, status: "confirmed", submitted_at: "2026-10-01T00:00:00Z" },
    ],
  };

  it("lists only submitted results the caller may review: item creator or current mentor", async () => {
    use({ ...base, mentorships: [{ mentor_id: ME, student_id: S1, valid_from: "2020-01-01", valid_to: null }] });
    const rows = await listReviewQueue();
    expect(rows.map((r) => r.resultId).sort()).toEqual(["r1", "r2"]);
  });
  it("excludes a result when the caller is neither creator nor current mentor (for example an HOD)", async () => {
    use({ ...base, mentorships: [] });
    expect((await listReviewQueue()).map((r) => r.resultId)).toEqual(["r2"]);
  });
  it("excludes a mentor whose link has ended", async () => {
    use({ ...base, mentorships: [{ mentor_id: ME, student_id: S1, valid_from: "2020-01-01", valid_to: "2020-06-01" }] });
    expect((await listReviewQueue()).map((r) => r.resultId)).toEqual(["r2"]);
  });
  it("marks later revisions as corrections and reports whether proof exists, without exposing the path", async () => {
    use({ ...base, mentorships: [] });
    const [row] = await listReviewQueue();
    expect(row).toMatchObject({ resultId: "r2", isCorrection: true, hasProof: false, studentName: "Karthik", itemTitle: "Internship" });
    expect(JSON.stringify(row)).not.toContain("proof_path");
  });
});

describe("getStudentProfile", () => {
  it("returns null and logs nothing for a student the caller cannot see", async () => {
    use({ profiles: [] });
    expect(await getStudentProfile(S1)).toBeNull();
    expect(m.logEvent).not.toHaveBeenCalled();
  });
  it("returns null for a non-student profile id", async () => {
    use({ profiles: [{ id: ME, role: "faculty", full_name: "M", email: "m", active: true }] });
    expect(await getStudentProfile(ME)).toBeNull();
    expect(m.logEvent).not.toHaveBeenCalled();
  });
  it("returns the profile and logs profile_open once", async () => {
    use({
      profiles: [{ id: S1, email: "a@c.edu", full_name: "Asha", role: "student", active: true }],
      student_year: [{ student_id: S1, year: 3 }],
      department_memberships: [],
      departments: [],
      mentorships: [],
      group_members: [],
      groups: [],
      invitations: [{ id: "i1", item_id: "it1", student_id: S1, status: "joined" }],
      items: [{ id: "it1", title: "Hackathon", type: "hackathon" }],
      results: [
        { id: "r1", invitation_id: "i1", revision: 1, outcome: "Won", details: null, status: "confirmed", review_note: null, submitted_at: "2026-10-01T00:00:00Z" },
        { id: "r2", invitation_id: "i1", revision: 2, outcome: "Won 1st", details: null, status: "submitted", review_note: null, submitted_at: "2026-11-01T00:00:00Z" },
      ],
    });
    const p = await getStudentProfile(S1);
    expect(p?.student).toMatchObject({ id: S1, fullName: "Asha", year: 3 });
    expect(p?.entries).toHaveLength(1);
    // The older confirmed value keeps counting until the correction is confirmed.
    expect(p?.entries[0].result).toMatchObject({ outcome: "Won", state: "sealed" });
    expect(p?.entries[0].pendingCorrection).toMatchObject({ outcome: "Won 1st" });
    expect(m.logEvent).toHaveBeenCalledTimes(1);
    expect(m.logEvent).toHaveBeenCalledWith("profile_open", "profile", S1);
  });
});

void FAR;
