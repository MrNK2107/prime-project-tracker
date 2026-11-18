import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { UsersRound } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/ui";
import { StageBadge } from "@/components/TrackingBits";
import { TrackingSwitch } from "@/components/TrackingSwitch";
import { TYPE_LABEL } from "@/components/ResultBadge";
import { listVisibleStudents } from "@/lib/faculty/queries";
import { eventsByStudent, loadEventTracking, narrowEvents, progressByStudent } from "@/lib/faculty/tracking";
import { EMPTY_SCOPE, audienceTabs, getMyScope, relationsOf } from "@/lib/faculty/scope";
import { getSessionProfile } from "@/lib/session";

export const metadata: Metadata = { title: "Students" };

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ scope?: string; sort?: string }> }) {
  await connection();
  const { scope: scopeParam, sort } = await searchParams;
  const me = await getSessionProfile();
  const isFaculty = me?.role === "faculty";
  // One round of reads, all at once.
  const [students, allEvents, scope] = await Promise.all([listVisibleStudents(), loadEventTracking(), isFaculty ? getMyScope() : Promise.resolve(EMPTY_SCOPE)]);

  const tabs = isFaculty ? audienceTabs(scope) : [];
  const tab = tabs.find((t) => t.id === scopeParam) ?? tabs[0];
  // Deactivated students are not tracked; only the admin still sees them (to manage them).
  const visible = students.filter((s) => me?.role === "admin" || s.active);
  const visibleIds = new Set(visible.map((s) => s.id));
  const rows = visible.filter((s) => !tab?.ids || tab.ids.has(s.id));
  const events = narrowEvents(allEvents, tab?.ids ?? null);
  const progress = progressByStudent(events);
  const byStudent = eventsByStudent(events);
  const attentionFirst = sort === "attention";
  const score = (id: string) => (progress.get(id)?.overdue ?? 0) * 10 + (progress.get(id)?.awaiting ?? 0);
  const ordered = attentionFirst ? [...rows].sort((a, b) => score(b.id) - score(a.id) || a.fullName.localeCompare(b.fullName)) : rows;
  const q = (o: { scope?: string; sort?: string }) => {
    const p = new URLSearchParams();
    const sc = o.scope ?? (tab && tabs.length > 1 ? tab.id : undefined);
    if (sc) p.set("scope", sc);
    const so = o.sort ?? sort;
    if (so === "attention") p.set("sort", "attention");
    return p.size ? `/students?${p.toString()}` : "/students";
  };

  return (
    <>
      <PageHeader title="Students" description={isFaculty ? "Track each student across events: who has joined, who is waiting on a confirmation, who is behind." : "Every student, with their events and results."} />
      {isFaculty && <TrackingSwitch active="student" />}
      {tabs.length > 1 && (
        <div className="tabs" aria-label="Which students">
          {tabs.map((t) => (
            <Link key={t.id} className="tab" href={q({ scope: t.id })} aria-current={t.id === tab?.id ? "page" : undefined}>
              {t.label} <span className="muted" style={{ marginLeft: "0.4rem" }}>{t.ids ? [...t.ids].filter((id) => visibleIds.has(id)).length : visible.length}</span>
            </Link>
          ))}
        </div>
      )}
      {ordered.length === 0 ? (
        <EmptyState icon={<UsersRound size={22} />} title="No students linked to you yet">
          {isFaculty ? "Students appear here once the admin makes you their mentor, a group lead, a head of department or a placement coordinator." : "Students appear here once their accounts are created."}
        </EmptyState>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.5rem" }}>
            <Link className="btn btn-ghost" href={q({ sort: attentionFirst ? "name" : "attention" })}>
              {attentionFirst ? "Sorted by who needs attention first" : "Sort by who needs attention first"}
            </Link>
          </div>
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
                {ordered.map((s) => {
                  const p = progress.get(s.id);
                  const list = byStudent.get(s.id) ?? [];
                  return (
                    <tr key={s.id}>
                      <td>
                        <div className="primary"><Link href={`/students/${s.id}`}>{s.fullName}</Link></div>
                        <div className="secondary">{[s.registerNo, s.department, s.active ? null : "Deactivated"].filter(Boolean).join(" · ") || s.email}</div>
                        {list.length > 0 && (
                          <details style={{ marginTop: "0.35rem" }}>
                            <summary style={{ cursor: "pointer", color: "var(--brand)", fontWeight: 600, fontSize: "var(--step--1)" }}>Their events ({list.length})</summary>
                            <ul style={{ listStyle: "none", padding: 0, margin: "0.5rem 0 0", display: "grid", gap: "0.4rem" }}>
                              {list.map((e) => (
                                <li key={e.eventId} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                                  {isFaculty ? <Link href={`/faculty/events/${e.eventId}`} style={{ fontWeight: 600 }}>{e.title}</Link> : <span style={{ fontWeight: 600 }}>{e.title}</span>}
                                  <span className="muted" style={{ fontSize: "var(--step--1)" }}>{TYPE_LABEL[e.type] ?? e.type}</span>
                                  <StageBadge stage={e.stage} overdue={e.overdue} />
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
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
        </>
      )}
    </>
  );
}
