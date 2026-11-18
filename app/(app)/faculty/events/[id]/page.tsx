import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft, Pencil, CalendarClock, CalendarDays, Video, Paperclip, ShieldCheck } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/ui";
import { TYPE_LABEL } from "@/components/ResultBadge";
import { FunnelBar, FunnelFigures, StageBadge } from "@/components/TrackingBits";
import { ProofButton } from "@/components/ProofButton";
import { getEventTracking } from "@/lib/faculty/tracking";
import { canEditEvent } from "@/lib/faculty/permissions";
import { getMyScope } from "@/lib/faculty/scope";
import type { Stage } from "@/lib/tracking";
import { safeHttpsUrl } from "@/lib/url";
import { formatWhen } from "@/lib/time";

export const metadata: Metadata = { title: "Event" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Who needs something from someone comes first.
const ORDER: Stage[] = ["awaiting", "sent_back", "joined", "no_reply", "confirmed", "declined"];
const FILTERS: { id: string; label: string; stages?: Stage[] }[] = [
  { id: "all", label: "Everyone" },
  { id: "review", label: "To review", stages: ["awaiting"] },
  { id: "pending", label: "Not done yet", stages: ["no_reply", "joined", "sent_back"] },
  { id: "confirmed", label: "Confirmed", stages: ["confirmed"] },
  { id: "declined", label: "Declined", stages: ["declined"] },
];

export default async function EventTrackingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ f?: string }> }) {
  await connection();
  const { id } = await params;
  const { f } = await searchParams;
  if (!UUID.test(id)) notFound();
  const [event, scope] = await Promise.all([getEventTracking(id), getMyScope()]);
  if (!event) notFound();
  const editable = canEditEvent(event, scope);

  const filter = FILTERS.find((x) => x.id === f) ?? FILTERS[0];
  const rows = event.participants
    .filter((p) => !filter.stages || filter.stages.includes(p.stage))
    .sort((a, b) => ORDER.indexOf(a.stage) - ORDER.indexOf(b.stage) || a.name.localeCompare(b.name));
  const count = (x: (typeof FILTERS)[number]) => (x.stages ? event.participants.filter((p) => x.stages!.includes(p.stage)).length : event.participants.length);
  const meeting = event.meetingUrl ? safeHttpsUrl(event.meetingUrl) : null;

  return (
    <>
      <Link href="/faculty" className="btn btn-ghost" style={{ marginBottom: "0.75rem", marginLeft: "-0.5rem" }}>
        <ArrowLeft size={18} aria-hidden="true" /> All events
      </Link>
      <PageHeader
        title={event.title}
        description={`${TYPE_LABEL[event.type] ?? event.type} · posted by ${event.mine ? "you" : event.organiser}`}
        action={editable ? <Link href={`/faculty/events/${event.id}/edit`} className="btn btn-secondary"><Pencil size={18} aria-hidden="true" /> Edit event</Link> : undefined}
      />

      <section className="panel rise" aria-label="Event details">
        {event.description && <p style={{ color: "var(--ink-2)", whiteSpace: "pre-wrap", marginBottom: "0.75rem" }}>{event.description}</p>}
        <ul className="event-meta">
          {event.startsAt && <li><CalendarDays size={14} aria-hidden="true" /> Starts {formatWhen(event.startsAt)}</li>}
          {event.deadline && <li><CalendarClock size={14} aria-hidden="true" /> Reply by {formatWhen(event.deadline)}</li>}
          {meeting && <li><Video size={14} aria-hidden="true" /> <a href={meeting} target="_blank" rel="noopener noreferrer">{event.type === "hackathon" || event.type === "internship" ? "Registration page" : "Meeting link"}</a></li>}
          {event.requiresProof && <li><Paperclip size={14} aria-hidden="true" /> Proof required</li>}
          {event.requiresConfirmation && <li><ShieldCheck size={14} aria-hidden="true" /> Results must be confirmed</li>}
        </ul>
        <FunnelFigures funnel={event.funnel} />
        <FunnelBar funnel={event.funnel} />
      </section>

      <h2 style={{ margin: "1.5rem 0 0.75rem" }}>Student by student</h2>
      <div className="tabs" aria-label="Filter students">
        {FILTERS.map((x) => (
          <Link key={x.id} className="tab" href={`/faculty/events/${event.id}${x.id === "all" ? "" : `?f=${x.id}`}`} aria-current={x.id === filter.id ? "page" : undefined}>
            {x.label} <span className="muted" style={{ marginLeft: "0.4rem" }}>{count(x)}</span>
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={<CalendarDays size={22} />} title={event.participants.length === 0 ? "No students are invited" : "No students in this view"}>
          {event.participants.length === 0 ? "Students you are not responsible for are left out when an event is created." : "Try another filter."}
        </EmptyState>
      ) : (
        <div className="table-wrap rise">
          <table className="table">
            <thead>
              <tr><th scope="col">Student</th><th scope="col">Progress</th><th scope="col">Result</th><th scope="col">Last activity</th></tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.invitationId}>
                  <td>
                    <div className="primary"><Link href={`/students/${p.studentId}`}>{p.name}</Link></div>
                    <div className="secondary">{p.department ?? ""}</div>
                  </td>
                  <td data-label="Progress"><StageBadge stage={p.stage} overdue={p.overdue} /></td>
                  <td data-label="Result">
                    {p.result ? (
                      <span>
                        <strong>{p.result.outcome}</strong>
                        {p.pendingCorrection && <span className="hint" style={{ display: "block" }}>Correction proposed: {p.pendingCorrection.outcome}</span>}
                        {p.result.hasProof && <span style={{ display: "block", marginTop: "0.25rem" }}><ProofButton resultId={p.result.id} /></span>}
                      </span>
                    ) : <span className="muted">None yet</span>}
                  </td>
                  <td data-label="Last activity">
                    {p.result ? formatWhen(p.result.submittedAt) : p.respondedAt ? formatWhen(p.respondedAt) : <span className="muted">No activity yet</span>}
                    {p.stage === "awaiting" && <Link href="/faculty/review" className="btn btn-secondary" style={{ display: "flex", marginTop: "0.4rem" }}>Review</Link>}
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
