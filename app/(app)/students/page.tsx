import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { UsersRound } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/ui";
import { listVisibleStudents } from "@/lib/faculty/queries";
import { loadEventTracking, progressByStudent } from "@/lib/faculty/tracking";
import { EMPTY_SCOPE, audienceTabs, getMyScope, relationsOf } from "@/lib/faculty/scope";
import { getSessionProfile } from "@/lib/session";

export const metadata: Metadata = { title: "Students" };

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  await connection();
  const { scope: scopeParam } = await searchParams;
  const me = await getSessionProfile();
  const isFaculty = me?.role === "faculty";
  const [students, events, scope] = await Promise.all([listVisibleStudents(), loadEventTracking(), isFaculty ? getMyScope() : Promise.resolve(EMPTY_SCOPE)]);

  const tabs = isFaculty ? audienceTabs(scope) : [];
  const tab = tabs.find((t) => t.id === scopeParam) ?? tabs[0];
  const rows = students.filter((s) => !tab?.ids || tab.ids.has(s.id));
  const progress = progressByStudent(events);
  const description = isFaculty ? "Progress for the students you are responsible for, as a mentor, group lead or head of department." : "Every student, with their events and results.";

  return (
    <>
      <PageHeader title="Students" description={description} />
      {tabs.length > 1 && (
        <div className="tabs" aria-label="Which students">
          {tabs.map((t) => (
            <Link key={t.id} className="tab" href={`/students?scope=${t.id}`} aria-current={t.id === tab?.id ? "page" : undefined}>
              {t.label} <span className="muted" style={{ marginLeft: "0.4rem" }}>{t.ids ? t.ids.size : students.length}</span>
            </Link>
          ))}
        </div>
      )}
      {rows.length === 0 ? (
        <EmptyState icon={<UsersRound size={22} />} title="No students linked to you yet">
          {isFaculty ? "Students appear here once the admin makes you their mentor, a group lead or a head of department." : "Students appear here once their accounts are created."}
        </EmptyState>
      ) : (
        <div className="table-wrap rise">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Student</th>
                {isFaculty && <th scope="col">Why you see them</th>}
                <th scope="col">Year</th>
                <th scope="col">Events</th>
                <th scope="col">Awaiting</th>
                <th scope="col">Confirmed</th>
                <th scope="col">Behind</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const p = progress.get(s.id);
                return (
                  <tr key={s.id}>
                    <td>
                      <div className="primary"><Link href={`/students/${s.id}`}>{s.fullName}</Link></div>
                      <div className="secondary">{[s.department, s.active ? null : "Deactivated"].filter(Boolean).join(" · ") || s.email}</div>
                    </td>
                    {isFaculty && (
                      <td data-label="Why you see them">
                        <span style={{ display: "inline-flex", gap: "0.3rem", flexWrap: "wrap" }}>
                          {relationsOf(scope, s.id).map((r) => <span key={r} className="badge badge-neutral">{r}</span>)}
                        </span>
                      </td>
                    )}
                    <td data-label="Year">{s.year ?? <span className="muted">-</span>}</td>
                    <td data-label="Events">{p?.total ?? 0}</td>
                    <td data-label="Awaiting">{p?.awaiting ? <span className="badge badge-claim">{p.awaiting}</span> : <span className="muted">0</span>}</td>
                    <td data-label="Confirmed">{p?.confirmed ? <span className="badge badge-seal">{p.confirmed}</span> : <span className="muted">0</span>}</td>
                    <td data-label="Behind">{p?.overdue ? <span className="badge badge-late">{p.overdue} overdue</span> : <span className="muted">0</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
