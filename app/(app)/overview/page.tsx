import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/ui";

export const metadata: Metadata = { title: "Overview" };

export default function PrincipalOverview() {
  return (
    <>
      <PageHeader title="Overview" description="A read-only view of confirmed results across all students." />
      <EmptyState icon={<BarChart3 size={22} />} title="No results to summarise yet">
        Confirmed results will be summarised here. Unconfirmed claims are always shown separately.
      </EmptyState>
    </>
  );
}
