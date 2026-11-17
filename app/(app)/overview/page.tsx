import type { Metadata } from "next";
import { connection } from "next/server";
import { PageHeader } from "@/components/ui";
import { DashboardView } from "@/components/DashboardView";
import { loadDashboard } from "@/lib/dashboards/queries";

export const metadata: Metadata = { title: "Overview" };

export default async function PrincipalOverview() {
  await connection();
  const data = await loadDashboard();
  return (
    <>
      <PageHeader title="Overview" description="Confirmed results across all students. Unconfirmed claims are shown separately." />
      <DashboardView data={data} studentLink={(id) => `/students/${id}`} />
    </>
  );
}
