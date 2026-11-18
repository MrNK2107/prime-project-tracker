import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { CalendarClock, CalendarDays, ClipboardCheck, Plus, AlertTriangle } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/ui";
import { TYPE_LABEL } from "@/components/ResultBadge";
import { FunnelBar, FunnelFigures } from "@/components/TrackingBits";
import { EventCalendar } from "@/components/EventCalendar";
import { loadEventTracking, type EventTrack } from "@/lib/faculty/tracking";
import { audienceTabs, getMyScope, hasAnyScope } from "@/lib/faculty/scope";
import { needsAttention, phaseOf } from "@/lib/tracking";
import { formatWhen } from "@/lib/time";

export const metadata: Metadata = { title: "Events" };

type Params = { view?: string; show?: string; month?: string; scope?: string };
const VIEWS = [
  { id: "attention", label: "Needs attention" },
  { id: "upcoming", label: "Upcoming" },
  { id: "past", label: "Past" },
  { id: "calendar", label: "Calendar" },
] as const;

function istToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function EventCard({ e }: { e: EventTrack }) {
  const attention = needsAttention(e.funnel);
  return (
    <Link href={`/faculty/events/${e.id}`} className="record event-card rise" data-attention={attention}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "flex-start" }}>
        <div>
          <h2 style={{ fontSize: "var(--step-1)" }}>{e.title}</h2>
          <p className="secondary" style={{ color: "var(--ink-2)" }}>{TYPE_LABEL[e.type] ?? e.type}{!e.mine && ` · posted by ${e.organiser}`}</p>
        </div>
        {e.funnel.awaiting > 0 && <span className="badge badge-claim">{e.funnel.awaiting} to review</span>}
      </div>
      <ul className="event-meta">
        {e.startsAt && <li><CalendarDays size={14} aria-hidden="true" /> Starts {formatWhen(e.startsAt)}</li>}
        {e.deadline && <li><CalendarClock size={14} aria-hidden="true" /> Reply by {formatWhen(e.deadline)}</li>}
        {e.funnel.overdue > 0 && <li style={{ color: "var(--danger)", fontWeight: 650 }}><AlertTriangle size={14} aria-hidden="true" /> {e.funnel.overdue} overdue</li>}
      </ul>
      <FunnelFigures funnel={e.funnel} />
      <FunnelBar funnel={e.funnel} compact />
    </Link>
  );
}

export default async function EventsPage({ searchParams }: { searchParams: Promise<Params> }) {
  await connection();
  const sp = await searchParams;
  const onlyMine = sp.show === "mine";
  const view = VIEWS.some((v) => v.id === sp.view) ? (sp.view as (typeof VIEWS)[number]["id"]) : "attention";
  const today = istToday();
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month ?? "") ? (sp.month as string) : today.slice(0, 7);

  // Audience filter, in priority order: mentees, groups, departments, everyone you can see.
  const scope = await getMyScope();
  const tabs = audienceTabs(scope);
  const tab = tabs.find((t) => t.id === sp.scope) ?? tabs[0];
  const loaded = await loadEventTracking(tab?.ids ? { studentIds: tab.ids } : {});
  const events = onlyMine ? loaded.filter((e) => e.mine) : loaded;

  const now = new Date();
  const shown =
    view === "attention" ? events.filter((e) => needsAttention(e.funnel))
    : view === "upcoming" ? events.filter((e) => phaseOf(e.startsAt, e.deadline, now) === "upcoming")
    : view === "past" ? events.filter((e) => phaseOf(e.startsAt, e.deadline, now) === "past")
    : events;
  const toReview = events.reduce((n, e) => n + e.funnel.awaiting, 0);
  const overdue = events.reduce((n, e) => n + e.funnel.overdue, 0);
  const attentionCount = events.filter((e) => needsAttention(e.funnel)).length;
  const qs = (o: { view?: string; scope?: string; show?: string }) => {
    const p = new URLSearchParams();
    p.set("view", o.view ?? view);
    if (tab && tabs.length > 1) p.set("scope", o.scope ?? tab.id);
    if ((o.show ?? (onlyMine ? "mine" : "")) === "mine") p.set("show", "mine");
    return `/faculty?${p.toString()}`;
  };

  const baseParams = new URLSearchParams();
  if (tab && tabs.length > 1) baseParams.set("scope", tab.id);
  if (onlyMine) baseParams.set("show", "mine");
  const calendarBase = baseParams.size ? `/faculty?${baseParams.toString()}` : "/faculty";

  return (
    <>
      <PageHeader
        title="Events"
        description="Hackathons, internships, events and meetings, and how far each student has got."
        action={hasAnyScope(scope) ? <Link href="/faculty/events/new" className="btn btn-primary"><Plus size={18} aria-hidden="true" /> New event</Link> : undefined}
      />

      {tabs.length > 1 && (
        <div className="tabs" aria-label="Which students" style={{ marginBottom: "0.75rem" }}>
          {tabs.map((t) => (
            <Link key={t.id} className="tab" href={qs({ scope: t.id })} aria-current={t.id === tab?.id ? "page" : undefined}>{t.label}</Link>
          ))}
        </div>
      )}

      <div className="panel rise" style={{ display: "flex", flexWrap: "wrap", gap: "1.5rem", alignItems: "center", marginBottom: "1.25rem" }}>
        <div><strong style={{ fontSize: "var(--step-2)", fontFamily: "var(--font-serif)" }}>{events.length}</strong> <span className="muted">events</span></div>
        <div><strong style={{ fontSize: "var(--step-2)", fontFamily: "var(--font-serif)" }}>{toReview}</strong> <span className="muted">results awaiting confirmation</span></div>
        <div><strong style={{ fontSize: "var(--step-2)", fontFamily: "var(--font-serif)", color: overdue ? "var(--danger)" : undefined }}>{overdue}</strong> <span className="muted">students overdue</span></div>
        <Link href="/faculty/review" className="btn btn-secondary" style={{ marginLeft: "auto" }}>
          <ClipboardCheck size={18} aria-hidden="true" /> Review queue
        </Link>
      </div>

      <div className="tabs">
        {VIEWS.map((v) => (
          <Link key={v.id} className="tab" href={qs({ view: v.id })} aria-current={view === v.id ? "page" : undefined}>
            {v.label}
            {v.id === "attention" && attentionCount > 0 && <span className="badge badge-claim" style={{ marginLeft: "0.5rem" }}>{attentionCount}</span>}
          </Link>
        ))}
        <Link className="tab" href={qs({ show: onlyMine ? "all" : "mine" })} style={{ marginLeft: "auto" }} aria-pressed={onlyMine}>
          {onlyMine ? "Showing only events I posted" : "Show only events I posted"}
        </Link>
      </div>

      {view === "calendar" ? (
        <EventCalendar events={events} month={month} basePath={calendarBase} todayIso={today} />
      ) : shown.length === 0 ? (
        <EmptyState icon={<CalendarDays size={22} />} title={events.length === 0 ? "No events for these students yet" : view === "attention" ? "Nothing needs your attention" : "No events here"}>
          {events.length === 0
            ? hasAnyScope(scope) ? "Create an event and choose who it is for. Students you target will see it and can join." : "You can post events once the admin makes you a mentor, group lead, head of department or placement coordinator."
            : view === "attention" ? "No results are waiting for review and no one is overdue." : "Try another view."}
        </EmptyState>
      ) : (
        <div className="event-grid">{shown.map((e) => <EventCard key={e.id} e={e} />)}</div>
      )}
    </>
  );
}
