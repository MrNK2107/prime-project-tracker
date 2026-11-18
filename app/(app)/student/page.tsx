import type { Metadata } from "next";
import { connection } from "next/server";
import { Inbox, CalendarClock, Video, Paperclip, ShieldCheck } from "lucide-react";
import { EmptyState } from "@/components/ui";
import { StudentHero, type RingKind } from "@/components/StudentHero";
import { getSessionProfile } from "@/lib/session";
import { ActionForm } from "@/components/ActionForm";
import { ResultForm } from "@/components/ResultForm";
import { ResultBadge, TYPE_LABEL } from "@/components/ResultBadge";
import { ProofButton } from "@/components/ProofButton";
import { listMyInvitations, type InvitationRow } from "@/lib/student/queries";
import { formatWhen } from "@/lib/time";
import { respondAction, submitResultAction } from "./form-actions";

export const metadata: Metadata = { title: "My events" };

function RespondButtons({ row }: { row: InvitationRow }) {
  if (row.item.deadlinePassed && row.status === "invited") {
    return <p className="hint">The reply deadline has passed.</p>;
  }
  const canChange = !row.item.deadlinePassed && !row.result && !row.pendingCorrection;
  return (
    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
      {row.status !== "joined" && canChange && (
        <ActionForm action={respondAction} submit="Join" compact>
          <input type="hidden" name="invitationId" value={row.invitationId} />
          <input type="hidden" name="status" value="joined" />
        </ActionForm>
      )}
      {row.status !== "declined" && canChange && (
        <ActionForm action={respondAction} submit={row.status === "joined" ? "Leave this event" : "Decline"} variant="secondary" compact confirm={row.status === "joined" ? "Leave this event? You can join again before the deadline." : undefined}>
          <input type="hidden" name="invitationId" value={row.invitationId} />
          <input type="hidden" name="status" value="declined" />
        </ActionForm>
      )}
    </div>
  );
}

function ItemCard({ row, ring }: { row: InvitationRow; ring?: number }) {
  const { item } = row;
  const state = row.result ? (row.result.state === "sealed" ? "sealed" : "claimed") : undefined;
  return (
    <article className="record rise" data-state={state} data-ring={ring} tabIndex={ring === undefined ? undefined : 0} aria-labelledby={`i-${row.invitationId}`}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
        <div>
          <h3 id={`i-${row.invitationId}`} style={{ fontSize: "var(--step-1)" }}>{item.title}</h3>
          <p className="secondary" style={{ color: "var(--ink-2)" }}>{TYPE_LABEL[item.type] ?? item.type}</p>
        </div>
        {row.result && <ResultBadge state={row.result.state} />}
        {!row.result && row.status === "joined" && <span className="badge badge-neutral">Joined</span>}
        {row.status === "declined" && <span className="badge badge-off">Declined</span>}
      </div>

      {item.description && <p style={{ margin: "0.6rem 0", color: "var(--ink-2)", whiteSpace: "pre-wrap" }}>{item.description}</p>}

      <ul style={{ listStyle: "none", display: "grid", gap: "0.3rem", margin: "0.6rem 0", color: "var(--ink-2)" }}>
        {item.startsAt && <li style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}><CalendarClock size={16} aria-hidden="true" /> Starts {formatWhen(item.startsAt)}</li>}
        {item.deadline && <li style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}><CalendarClock size={16} aria-hidden="true" /> Reply by {formatWhen(item.deadline)}{item.deadlinePassed ? " (passed)" : ""}</li>}
        {item.meetingUrl && (
          <li style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <Video size={16} aria-hidden="true" /> <a href={item.meetingUrl} target="_blank" rel="noopener noreferrer">{item.type === "hackathon" || item.type === "internship" ? "Open registration page" : "Open meeting link"}</a>
          </li>
        )}
        {item.requiresProof && <li style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}><Paperclip size={16} aria-hidden="true" /> Needs proof with your result</li>}
        {item.requiresConfirmation && <li style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}><ShieldCheck size={16} aria-hidden="true" /> Your result counts once a faculty member confirms it</li>}
      </ul>

      {row.result && (
        <div style={{ margin: "0.75rem 0" }}>
          <p style={{ fontWeight: 650 }}>{row.result.outcome}</p>
          {row.result.details && <p style={{ color: "var(--ink-2)", whiteSpace: "pre-wrap" }}>{row.result.details}</p>}
          {row.result.state === "sent_back" && row.result.note && (
            <p className="error-text" style={{ marginTop: "0.5rem" }}>Sent back: {row.result.note}</p>
          )}
          {row.result.hasProof && <div style={{ marginTop: "0.5rem" }}><ProofButton resultId={row.result.id} /></div>}
        </div>
      )}

      {row.pendingCorrection && (
        <div className="record" data-state="claimed" style={{ margin: "0.75rem 0" }}>
          <p style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
            <ResultBadge state={row.pendingCorrection.state} /> <strong>Your correction:</strong> {row.pendingCorrection.outcome}
          </p>
          {row.pendingCorrection.state === "sent_back" && row.pendingCorrection.note && <p className="error-text" style={{ marginTop: "0.5rem" }}>Sent back: {row.pendingCorrection.note}</p>}
          <p className="hint">Your confirmed result above stays in place until the correction is confirmed.</p>
        </div>
      )}

      <RespondButtons row={row} />

      {row.canSubmit && (
        <details style={{ marginTop: "1rem" }} open={row.result?.state === "sent_back"}>
          <summary className="btn btn-primary" style={{ display: "inline-flex", listStyle: "none" }}>
            {row.result?.state === "sent_back" ? "Fix and resubmit" : "Submit your result"}
          </summary>
          <div style={{ marginTop: "1rem" }}>
            <ResultForm action={submitResultAction} mode="submit" invitationId={row.invitationId} requireProof={item.requiresProof} submitLabel={row.result ? "Resubmit result" : "Submit result"} defaults={row.result ? { outcome: row.result.outcome, details: row.result.details } : undefined} />
          </div>
        </details>
      )}

      {row.result?.state === "sealed" && !row.pendingCorrection && (
        <details style={{ marginTop: "1rem" }}>
          <summary className="btn btn-secondary" style={{ display: "inline-flex", listStyle: "none" }}>Request a correction</summary>
          <div style={{ marginTop: "1rem" }}>
            <p className="hint" style={{ marginBottom: "0.75rem" }}>A correction goes to a faculty member for review. Your current confirmed result keeps counting until then.</p>
            <ResultForm action={submitResultAction} mode="correction" invitationId={row.invitationId} resultId={row.result.id} requireProof={item.requiresProof} submitLabel="Send correction" defaults={{ outcome: row.result.outcome, details: row.result.details }} />
          </div>
        </details>
      )}
    </article>
  );
}

function Section({ title, rows, id, ringOf }: { title: string; rows: InvitationRow[]; id: string; ringOf: Map<string, number> }) {
  if (rows.length === 0) return null;
  return (
    <section id={id} style={{ marginTop: "2rem", scrollMarginTop: "5rem" }} aria-labelledby={`s-${title}`}>
      <h2 id={`s-${title}`} style={{ marginBottom: "0.75rem" }}>
        {title} <span className="muted" style={{ fontWeight: 500 }}>({rows.length})</span>
      </h2>
      <div className="stack">{rows.map((r) => <ItemCard key={r.invitationId} row={r} ring={ringOf.get(r.invitationId)} />)}</div>
    </section>
  );
}

export default async function StudentHome() {
  await connection();
  const rows = await listMyInvitations();
  const toAnswer = rows.filter((r) => r.status === "invited");
  const joined = rows.filter((r) => r.status === "joined");
  const declined = rows.filter((r) => r.status === "declined");

  const profile = await getSessionProfile();
  // One ring segment per record, in list order: solid once confirmed, dashed while it is still a claim.
  const withResult = rows.filter((r) => r.result);
  const ringOf = new Map(withResult.map((r, i) => [r.invitationId, i]));
  const kinds: RingKind[] = withResult.map((r) => (r.result!.state === "sealed" ? "sealed" : "claimed"));
  const toFix = rows.filter((r) => r.result?.state === "sent_back").length;

  return (
    <StudentHero name={profile?.fullName ?? ""} kinds={kinds} toReply={toAnswer.length} toFix={toFix}>
      {rows.length === 0 ? (
        <EmptyState icon={<Inbox size={22} />} title="Nothing here yet">
          When a faculty member invites you to an event, it will appear here for you to join or decline.
        </EmptyState>
      ) : (
        <>
          <Section id="reply" title="Waiting for your reply" rows={toAnswer} ringOf={ringOf} />
          <Section id="joined" title="Joined" rows={joined} ringOf={ringOf} />
          <Section id="declined" title="Declined" rows={declined} ringOf={ringOf} />
        </>
      )}
    </StudentHero>
  );
}
