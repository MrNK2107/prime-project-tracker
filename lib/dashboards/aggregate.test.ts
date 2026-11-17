import { describe, it, expect } from "vitest";
import { buildDashboard, type StudentInfo } from "@/lib/dashboards/aggregate";

const students: StudentInfo[] = [
  { id: "s1", name: "Asha", department: "CSE", year: 2 },
  { id: "s2", name: "Karthik", department: "CSE", year: 3 },
  { id: "s3", name: "Divya", department: "ECE", year: 1 },
];

describe("buildDashboard", () => {
  const d = buildDashboard(
    students,
    [
      { student_id: "s1", item_type: "hackathon", count: 2 },
      { student_id: "s2", item_type: "internship", count: "1" },
      { student_id: "outsider", item_type: "event", count: 9 },
    ],
    [{ student_id: "s1", item_type: "internship", count: 1 }],
  );
  it("keeps confirmed and claimed totals separate", () => {
    expect(d.confirmedTotal).toBe(3);
    expect(d.claimedTotal).toBe(1);
  });
  it("ignores counts for students outside the list", () => {
    expect(d.confirmedByType.map((t) => t.type)).not.toContain("event");
  });
  it("counts per student, most confirmed first", () => {
    expect(d.students.map((s) => [s.name, s.confirmed, s.claimed])).toEqual([
      ["Asha", 2, 1],
      ["Karthik", 1, 0],
      ["Divya", 0, 0],
    ]);
  });
  it("groups by department", () => {
    expect(d.byDepartment).toEqual([
      { department: "CSE", students: 2, confirmed: 3, claimed: 1 },
      { department: "ECE", students: 1, confirmed: 0, claimed: 0 },
    ]);
  });
  it("is all zeros and empty, not an error, with no students", () => {
    expect(buildDashboard([], [], [])).toEqual({ confirmedByType: [], claimedByType: [], confirmedTotal: 0, claimedTotal: 0, students: [], byDepartment: [] });
  });
});
