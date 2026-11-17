import type { Metadata } from "next";
import { ListChecks } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/ui";

export const metadata: Metadata = { title: "Items" };

export default function FacultyHome() {
  return (
    <>
      <PageHeader title="Items" description="Items you have posted and results waiting for your review." />
      <EmptyState icon={<ListChecks size={22} />} title="No items yet">
        Items you create, and results that need your confirmation, will be listed here.
      </EmptyState>
    </>
  );
}
