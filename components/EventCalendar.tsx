import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { calendarDay, needsAttention } from "@/lib/tracking";
import { formatDay } from "@/lib/time";
import type { EventTrack } from "@/lib/faculty/tracking";

type Mark = { event: EventTrack; kind: "starts" | "deadline" };

function marks(events: EventTrack[]): Map<string, Mark[]> {
  const m = new Map<string, Mark[]>();
  const add = (day: string | null, mark: Mark) => {
    if (!day) return;
    m.set(day, [...(m.get(day) ?? []), mark]);
  };
  for (const e of events) {
    add(calendarDay(e.startsAt, null), { event: e, kind: "starts" });
    // A reply-by date on a different day from the start is its own marker.
    const dl = calendarDay(null, e.deadline);
    if (dl && dl !== calendarDay(e.startsAt, null)) add(dl, { event: e, kind: "deadline" });
  }
  return m;
}

const shift = (month: string, by: number) => {
  const [y, mo] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

/** A month of events on their dates (start and reply-by), with an agenda list for phones. */
export function EventCalendar({ events, month, basePath, todayIso }: { events: EventTrack[]; month: string; basePath: string; todayIso: string }) {
  const [y, mo] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, mo - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7; // Monday first
  const daysIn = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const cells = Math.ceil((lead + daysIn) / 7) * 7;
  const byDay = marks(events);
  const title = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(first);
  const link = (m: string) => `${basePath}${basePath.includes("?") ? "&" : "?"}view=calendar&month=${m}`;

  const monthKeys = [...byDay.keys()].filter((k) => k.startsWith(month)).sort();

  return (
    <section aria-label={`Events in ${title}`}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
        <Link href={link(shift(month, -1))} className="btn btn-ghost" aria-label="Previous month"><ChevronLeft size={18} aria-hidden="true" /></Link>
        <h2 style={{ fontSize: "var(--step-1)" }}>{title}</h2>
        <Link href={link(shift(month, 1))} className="btn btn-ghost" aria-label="Next month"><ChevronRight size={18} aria-hidden="true" /></Link>
      </div>

      <div className="cal" role="grid" aria-label={title}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="cal-head" role="columnheader">{d}</div>)}
        {Array.from({ length: cells }, (_, i) => {
          const dayNum = i - lead + 1;
          const inMonth = dayNum >= 1 && dayNum <= daysIn;
          const key = inMonth ? `${month}-${String(dayNum).padStart(2, "0")}` : null;
          const list = key ? byDay.get(key) ?? [] : [];
          return (
            <div key={i} className="cal-day" role="gridcell" data-out={!inMonth} data-today={key === todayIso}>
              {inMonth && <span className="cal-num">{dayNum}</span>}
              {list.map((mk) => (
                <Link key={mk.event.id + mk.kind} href={`/faculty/events/${mk.event.id}`} className="cal-pill" data-kind={mk.kind} data-attention={needsAttention(mk.event.funnel)} title={`${mk.kind === "deadline" ? "Reply by: " : ""}${mk.event.title}`}>
                  {mk.kind === "deadline" ? "Due: " : ""}{mk.event.title}
                </Link>
              ))}
            </div>
          );
        })}
      </div>

      <div className="agenda-only">
        {monthKeys.length === 0 ? (
          <p className="muted">Nothing scheduled this month.</p>
        ) : (
          <ul className="stack" style={{ listStyle: "none", padding: 0 }}>
            {monthKeys.flatMap((k) => (byDay.get(k) ?? []).map((mk) => (
              <li key={k + mk.event.id + mk.kind} className="record">
                <p className="hint">{formatDay(`${k}T12:00:00+05:30`)}{mk.kind === "deadline" ? " · reply by" : ""}</p>
                <Link href={`/faculty/events/${mk.event.id}`} style={{ fontWeight: 650 }}>{mk.event.title}</Link>
              </li>
            )))}
          </ul>
        )}
      </div>
    </section>
  );
}
