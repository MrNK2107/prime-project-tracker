import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ListChecks, Plus, ClipboardCheck } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/ui";
import { TYPE_LABEL } from "@/components/ResultBadge";
import { listMyItems, listReviewQueue } from "@/lib/faculty/queries";
import { formatDay } from "@/lib/time";

export const metadata: Metadata = { title: "Items" };

export default async function FacultyHome() {
  await connection();
  const [items, queue] = await Promise.all([listMyItems(), listReviewQueue()]);

  return (
    <>
      <PageHeader
        title="Items"
        description="Hackathons, internships, events and meetings you have posted."
        action={
          <Link href="/faculty/items/new" className="btn btn-primary">
            <Plus size={18} aria-hidden="true" /> New item
          </Link>
        }
      />

      {queue.length > 0 && (
        <Link href="/faculty/review" className="panel rise" style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.25rem", textDecoration: "none", color: "inherit", borderColor: "var(--claim-line)", borderStyle: "dashed", background: "var(--claim-tint)" }}>
          <ClipboardCheck size={22} aria-hidden="true" style={{ color: "var(--claim)" }} />
          <span>
            <strong>{queue.length === 1 ? "1 result is" : `${queue.length} results are`} waiting for you to confirm.</strong>{" "}
            <span style={{ color: "var(--brand)", fontWeight: 650 }}>Review now</span>
          </span>
        </Link>
      )}

      {items.length === 0 ? (
        <EmptyState icon={<ListChecks size={22} />} title="You have not posted anything yet">
          Create an item and choose who it is for. Students you target will see it and can join.
        </EmptyState>
      ) : (
        <div className="table-wrap rise">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col">Deadline</th>
                <th scope="col">Invited</th>
                <th scope="col">Joined</th>
                <th scope="col">To review</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td>
                    <div className="primary">{it.title}</div>
                    <div className="secondary">{TYPE_LABEL[it.type] ?? it.type}</div>
                  </td>
                  <td data-label="Deadline">{it.deadline ? formatDay(it.deadline) : <span className="muted">None</span>}</td>
                  <td data-label="Invited">{it.invited}</td>
                  <td data-label="Joined">{it.joined}</td>
                  <td data-label="To review">
                    {it.awaitingReview > 0 ? <span className="badge badge-claim">{it.awaitingReview}</span> : <span className="muted">0</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
