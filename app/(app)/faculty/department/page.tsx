import type { Metadata } from "next";
import { connection } from "next/server";
import { Building2 } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/ui";
import { DashboardView } from "@/components/DashboardView";
import Link from "next/link";
import { FunnelBar } from "@/components/TrackingBits";
import { TYPE_LABEL } from "@/components/ResultBadge";
import { loadDashboard, myDepartments } from "@/lib/dashboards/queries";
import { loadEventTracking } from "@/lib/faculty/tracking";
import { getMyScope } from "@/lib/faculty/scope";
import { formatDay } from "@/lib/time";

export const metadata: Metadata = { title: "Department" };

export default async function DepartmentPage() {
  await connection();
  const departments = await myDepartments();

  if (departments.length === 0) {
    return (
      <>
        <PageHeader title="Department" />
        <EmptyState icon={<Building2 size={22} />} title="You are not a head of department">
          This page shows confirmed results for a department once the admin names you its head.
        </EmptyState>
      </>
    );
  }

  const scope = await getMyScope();
  const sections = await Promise.all(
    departments.map(async (d) => {
      const ids = new Set(scope.departments.find((x) => x.id === d.id)?.studentIds ?? []);
      return { d, data: await loadDashboard(d.id), events: await loadEventTracking({ studentIds: ids }) };
    }),
  );
  return (
    <>
      {sections.map(({ d, data, events }) => (
        <div key={d.id} style={{ marginBottom: "2.5rem" }}>
          <PageHeader title={d.name} description="Confirmed results for your department. Unconfirmed claims are shown separately." />
          <DashboardView data={data} studentLink={(id) => `/students/${id}`} />

          <h2 style={{ margin: "2rem 0 0.75rem" }}>Event tracking</h2>
          {events.length === 0 ? (
            <p className="muted">No events have been posted to students in this department yet.</p>
          ) : (
            <div className="table-wrap rise">
              <table className="table">
                <thead>
                  <tr><th scope="col">Event</th><th scope="col">Progress</th><th scope="col">Invited</th><th scope="col">Confirmed</th><th scope="col">Awaiting</th><th scope="col">Overdue</th></tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <div className="primary"><Link href={`/faculty/events/${e.id}`}>{e.title}</Link></div>
                        <div className="secondary">{TYPE_LABEL[e.type] ?? e.type} · {e.organiser}{e.startsAt ? ` · ${formatDay(e.startsAt)}` : ""}</div>
                      </td>
                      <td data-label="Progress" style={{ minWidth: "9rem" }}><FunnelBar funnel={e.funnel} compact /></td>
                      <td data-label="Invited">{e.funnel.invited}</td>
                      <td data-label="Confirmed">{e.funnel.confirmed}</td>
                      <td data-label="Awaiting">{e.funnel.awaiting}</td>
                      <td data-label="Overdue">{e.funnel.overdue ? <span className="badge badge-late">{e.funnel.overdue}</span> : <span className="muted">0</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </>
  );
}
