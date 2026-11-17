import type { Metadata } from "next";
import { Users } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/ui";

export const metadata: Metadata = { title: "Accounts" };

export default function AdminHome() {
  return (
    <>
      <PageHeader title="Accounts" description="Create accounts and manage mentor, group and department links." />
      <EmptyState icon={<Users size={22} />} title="No accounts to show">
        Accounts and their links will be managed from this page.
      </EmptyState>
    </>
  );
}
