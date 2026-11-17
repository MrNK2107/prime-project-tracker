import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ClipboardCheck } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/ui";
import { ReviewActions } from "@/components/ReviewActions";
import { ProofButton } from "@/components/ProofButton";
import { TYPE_LABEL } from "@/components/ResultBadge";
import { listReviewQueue } from "@/lib/faculty/queries";
import { formatWhen } from "@/lib/time";
import { reviewAction } from "../form-actions";

export const metadata: Metadata = { title: "Review" };

export default async function ReviewPage() {
  await connection();
  const rows = await listReviewQueue();

  return (
    <>
      <PageHeader title="Review" description="Results waiting for you to confirm or send back. A result only counts once it is confirmed." />
      {rows.length === 0 ? (
        <EmptyState icon={<ClipboardCheck size={22} />} title="Nothing to review">
          When a student you mentor, or one invited to your item, submits a result, it will appear here.
        </EmptyState>
      ) : (
        <div className="stack">
          {rows.map((r) => (
            <article key={r.resultId} className="record rise" data-state="claimed" aria-labelledby={`r-${r.resultId}`}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
                <div>
                  <h2 id={`r-${r.resultId}`} style={{ fontSize: "var(--step-1)" }}>{r.itemTitle}</h2>
                  <p className="secondary" style={{ color: "var(--ink-2)" }}>
                    <Link href={`/faculty/students/${r.studentId}`}>{r.studentName}</Link> · {TYPE_LABEL[r.itemType] ?? r.itemType} · submitted {formatWhen(r.submittedAt)}
                  </p>
                </div>
                <span className="badge badge-claim">{r.isCorrection ? "Correction" : "Awaiting confirmation"}</span>
              </div>
              <p style={{ margin: "0.75rem 0 0.25rem", fontWeight: 650 }}>{r.outcome}</p>
              {r.details && <p style={{ color: "var(--ink-2)", whiteSpace: "pre-wrap" }}>{r.details}</p>}
              {r.hasProof && <div style={{ marginTop: "0.75rem" }}><ProofButton resultId={r.resultId} /></div>}
              <hr className="perforation" style={{ margin: "1rem 0" }} />
              <ReviewActions action={reviewAction} resultId={r.resultId} />
            </article>
          ))}
        </div>
      )}
    </>
  );
}
