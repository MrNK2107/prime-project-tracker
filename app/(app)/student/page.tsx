import type { Metadata } from "next";
import { Inbox } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/ui";

export const metadata: Metadata = { title: "My items" };

export default function StudentHome() {
  return (
    <>
      <PageHeader title="My items" description="Hackathons, internships, events and meetings your faculty have invited you to." />
      <EmptyState icon={<Inbox size={22} />} title="Nothing here yet">
        When a faculty member invites you to an item, it will appear here for you to join or decline.
      </EmptyState>
    </>
  );
}
