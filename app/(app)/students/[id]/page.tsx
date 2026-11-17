import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft, Inbox } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/ui";
import { ResultBadge, TYPE_LABEL } from "@/components/ResultBadge";
import { ProofButton } from "@/components/ProofButton";
import { getStudentProfile } from "@/lib/faculty/queries";
import { formatWhen } from "@/lib/time";

export const metadata: Metadata = { title: "Student" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function StudentProfilePage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const profile = await getStudentProfile(id);
  // Not visible and not existing look the same.
  if (!profile) notFound();
  const { student, entries } = profile;

  return (
    <>
      <Link href="/students" className="btn btn-ghost" style={{ marginBottom: "0.75rem", marginLeft: "-0.5rem" }}>
        <ArrowLeft size={18} aria-hidden="true" /> All students
      </Link>
      <PageHeader title={student.fullName} description={student.email} />

      <dl className="panel rise" style={{ display: "grid", gap: "0.75rem 2rem", gridTemplateColumns: "repeat(auto-fit, minmax(11rem, 1fr))", marginBottom: "1.5rem" }}>
        {[
          ["Department", student.department ?? "None"],
          ["Year", student.year ? `Year ${student.year}` : "Not set"],
          ["Mentor", student.mentor ?? "None"],
          ["Groups", student.groups.length ? student.groups.join(", ") : "None"],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="hint">{k}</dt>
            <dd style={{ fontWeight: 650 }}>{v}</dd>
          </div>
        ))}
      </dl>

      <h2 style={{ marginBottom: "0.75rem" }}>Items and results</h2>
      {entries.length === 0 ? (
        <EmptyState icon={<Inbox size={22} />} title="No items yet">This student has not been invited to anything you can see.</EmptyState>
      ) : (
        <div className="stack">
          {entries.map((e) => (
            <article key={e.invitationId} className="record rise" data-state={e.result ? (e.result.state === "sealed" ? "sealed" : "claimed") : undefined}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
                <div>
                  <h3 style={{ fontSize: "var(--step-1)" }}>{e.itemTitle}</h3>
                  <p className="secondary" style={{ color: "var(--ink-2)" }}>{TYPE_LABEL[e.itemType] ?? e.itemType} · {e.invitationStatus === "joined" ? "Joined" : e.invitationStatus === "declined" ? "Declined" : "Invited, no reply yet"}</p>
                </div>
                {e.result && <ResultBadge state={e.result.state} />}
              </div>
              {e.result && (
                <>
                  <p style={{ margin: "0.75rem 0 0.25rem", fontWeight: 650 }}>{e.result.outcome}</p>
                  {e.result.details && <p style={{ color: "var(--ink-2)", whiteSpace: "pre-wrap" }}>{e.result.details}</p>}
                  {e.result.state === "sent_back" && e.result.note && <p className="hint">Sent back: {e.result.note}</p>}
                  <p className="hint">Submitted {formatWhen(e.result.submittedAt)}</p>
                  {e.result.hasProof && <div style={{ marginTop: "0.5rem" }}><ProofButton resultId={e.result.id} /></div>}
                </>
              )}
              {e.pendingCorrection && (
                <div className="record" data-state="claimed" style={{ marginTop: "0.75rem" }}>
                  <p style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                    <ResultBadge state={e.pendingCorrection.state} /> <strong>Correction proposed:</strong> {e.pendingCorrection.outcome}
                  </p>
                  <p className="hint">The confirmed result above keeps counting until the correction is confirmed.</p>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
