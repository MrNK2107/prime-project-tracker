import type { Metadata } from "next";
import { connection } from "next/server";
import { Building2 } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/ui";
import { DashboardView } from "@/components/DashboardView";
import { loadDashboard, myDepartments } from "@/lib/dashboards/queries";

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

  const sections = await Promise.all(departments.map(async (d) => ({ d, data: await loadDashboard(d.id) })));
  return (
    <>
      {sections.map(({ d, data }) => (
        <div key={d.id} style={{ marginBottom: "2.5rem" }}>
          <PageHeader title={d.name} description="Confirmed results for your department. Unconfirmed claims are shown separately." />
          <DashboardView data={data} studentLink={(id) => `/students/${id}`} />
        </div>
      ))}
    </>
  );
}
