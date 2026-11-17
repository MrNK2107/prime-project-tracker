/** Pure aggregation for the dashboards. Confirmed and claimed are always kept apart. */
export type CountRow = { student_id: string; item_type: string; count: number | string };
export type StudentInfo = { id: string; name: string; department: string | null; year: number | null };

export type DashboardStudent = {
  id: string;
  name: string;
  department: string | null;
  year: number | null;
  confirmed: number;
  claimed: number;
};

export type Dashboard = {
  confirmedByType: { type: string; count: number }[];
  claimedByType: { type: string; count: number }[];
  confirmedTotal: number;
  claimedTotal: number;
  students: DashboardStudent[];
  byDepartment: { department: string; students: number; confirmed: number; claimed: number }[];
};

function byType(rows: CountRow[], allowed: Set<string>) {
  const m = new Map<string, number>();
  for (const r of rows) if (allowed.has(r.student_id)) m.set(r.item_type, (m.get(r.item_type) ?? 0) + Number(r.count));
  return [...m.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
}

export function buildDashboard(students: StudentInfo[], confirmed: CountRow[], claims: CountRow[]): Dashboard {
  const ids = new Set(students.map((s) => s.id));
  const sum = (rows: CountRow[], id: string) => rows.filter((r) => r.student_id === id).reduce((n, r) => n + Number(r.count), 0);

  const list: DashboardStudent[] = students
    .map((s) => ({ ...s, confirmed: sum(confirmed, s.id), claimed: sum(claims, s.id) }))
    .sort((a, b) => b.confirmed - a.confirmed || a.name.localeCompare(b.name));

  const depts = new Map<string, { students: number; confirmed: number; claimed: number }>();
  for (const s of list) {
    const key = s.department ?? "No department";
    const d = depts.get(key) ?? { students: 0, confirmed: 0, claimed: 0 };
    d.students += 1;
    d.confirmed += s.confirmed;
    d.claimed += s.claimed;
    depts.set(key, d);
  }

  const confirmedByType = byType(confirmed, ids);
  const claimedByType = byType(claims, ids);
  return {
    confirmedByType,
    claimedByType,
    confirmedTotal: confirmedByType.reduce((n, t) => n + t.count, 0),
    claimedTotal: claimedByType.reduce((n, t) => n + t.count, 0),
    students: list,
    byDepartment: [...depts.entries()].map(([department, v]) => ({ department, ...v })).sort((a, b) => a.department.localeCompare(b.department)),
  };
}
