import Link from "next/link";
import { ShieldCheck, Clock, UsersRound } from "lucide-react";
import { EmptyState } from "@/components/ui";
import { TYPE_LABEL } from "@/components/ResultBadge";
import type { Dashboard } from "@/lib/dashboards/aggregate";

/**
 * Confirmed results and unconfirmed claims, in separate sections that never share a number:
 * only confirmed results are counted as achievements.
 */
export function DashboardView({ data, studentLink }: { data: Dashboard; studentLink?: (id: string) => string }) {
  if (data.students.length === 0) {
    return (
      <EmptyState icon={<UsersRound size={22} />} title="No students to show">
        Students appear here once they are placed in a department you can see.
      </EmptyState>
    );
  }

  return (
    <div className="stack">
      <section className="panel rise" data-state="sealed" aria-labelledby="confirmed-title" style={{ borderColor: "color-mix(in srgb, var(--seal) 40%, var(--line))" }}>
        <h2 id="confirmed-title" style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--seal)" }}>
          <ShieldCheck size={20} aria-hidden="true" /> Confirmed results
        </h2>
        <p style={{ margin: "0.5rem 0 1rem", color: "var(--ink-2)" }}>
          <strong style={{ fontSize: "var(--step-2)", color: "var(--ink)" }}>{data.confirmedTotal}</strong> confirmed across {data.students.length} {data.students.length === 1 ? "student" : "students"}.
        </p>
        {data.confirmedByType.length === 0 ? (
          <p className="muted">Nothing has been confirmed yet.</p>
        ) : (
          <ul style={{ listStyle: "none", display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {data.confirmedByType.map((t) => (
              <li key={t.type} className="badge badge-seal" style={{ fontSize: "var(--step-0)" }}>{TYPE_LABEL[t.type] ?? t.type}: {t.count}</li>
            ))}
          </ul>
        )}
      </section>

      {data.byDepartment.length > 1 && (
        <div className="table-wrap rise">
          <table className="table">
            <caption className="visually-hidden">Confirmed results by department</caption>
            <thead>
              <tr><th scope="col">Department</th><th scope="col">Students</th><th scope="col">Confirmed</th></tr>
            </thead>
            <tbody>
              {data.byDepartment.map((d) => (
                <tr key={d.department}>
                  <td className="primary">{d.department}</td>
                  <td data-label="Students">{d.students}</td>
                  <td data-label="Confirmed">{d.confirmed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="table-wrap rise">
        <table className="table">
          <caption className="visually-hidden">Confirmed results by student</caption>
          <thead>
            <tr><th scope="col">Student</th><th scope="col">Department</th><th scope="col">Year</th><th scope="col">Confirmed</th></tr>
          </thead>
          <tbody>
            {data.students.map((s) => (
              <tr key={s.id}>
                <td className="primary">{studentLink ? <Link href={studentLink(s.id)}>{s.name}</Link> : s.name}</td>
                <td data-label="Department">{s.department ?? <span className="muted">None</span>}</td>
                <td data-label="Year">{s.year ?? <span className="muted">-</span>}</td>
                <td data-label="Confirmed">{s.confirmed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="record rise" data-state="claimed" aria-labelledby="claims-title">
        <h2 id="claims-title" style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--claim)" }}>
          <Clock size={20} aria-hidden="true" /> Unconfirmed claims
        </h2>
        <p style={{ margin: "0.5rem 0 1rem", color: "var(--ink-2)" }}>
          Results students have submitted that nobody has confirmed yet. These are <strong>not</strong> counted above.
        </p>
        {data.claimedTotal === 0 ? (
          <p className="muted">No unconfirmed claims.</p>
        ) : (
          <>
            <ul style={{ listStyle: "none", display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
              {data.claimedByType.map((t) => (
                <li key={t.type} className="badge badge-claim" style={{ fontSize: "var(--step-0)" }}>{TYPE_LABEL[t.type] ?? t.type}: {t.count}</li>
              ))}
            </ul>
            <ul style={{ listStyle: "none", display: "grid", gap: "0.35rem" }}>
              {data.students.filter((s) => s.claimed > 0).map((s) => (
                <li key={s.id} style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                  <span>{studentLink ? <Link href={studentLink(s.id)}>{s.name}</Link> : s.name}</span>
                  <span className="muted">{s.claimed} waiting</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
