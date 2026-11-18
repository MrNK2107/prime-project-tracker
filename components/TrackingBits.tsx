import { ShieldCheck, Clock, Undo2, CircleDashed, UserCheck, XCircle, AlertTriangle } from "lucide-react";
import { STAGE_LABEL, type Funnel, type Stage } from "@/lib/tracking";

/** One badge per stage. Confirmed (solid) and awaiting (dashed) never look alike. */
export function StageBadge({ stage, overdue }: { stage: Stage; overdue?: boolean }) {
  const label = STAGE_LABEL[stage];
  const body = {
    confirmed: <span className="badge badge-seal"><ShieldCheck size={14} aria-hidden="true" /> {label}</span>,
    awaiting: <span className="badge badge-claim"><Clock size={14} aria-hidden="true" /> {label}</span>,
    sent_back: <span className="badge badge-neutral"><Undo2 size={14} aria-hidden="true" /> {label}</span>,
    joined: <span className="badge badge-neutral"><UserCheck size={14} aria-hidden="true" /> {label}</span>,
    no_reply: <span className="badge badge-off"><CircleDashed size={14} aria-hidden="true" /> {label}</span>,
    declined: <span className="badge badge-off"><XCircle size={14} aria-hidden="true" /> {label}</span>,
  }[stage];
  return (
    <span style={{ display: "inline-flex", gap: "0.35rem", flexWrap: "wrap", alignItems: "center" }}>
      {body}
      {overdue && <span className="badge badge-late"><AlertTriangle size={14} aria-hidden="true" /> Overdue</span>}
    </span>
  );
}

/**
 * The tracking bar: how far an event's invited students have got. Segments are drawn from the counts,
 * with the numbers also written out so the bar is never the only signal.
 */
export function FunnelBar({ funnel, compact = false }: { funnel: Funnel; compact?: boolean }) {
  const total = funnel.invited || 1;
  const pending = funnel.joined - funnel.submitted;
  const segs = [
    { cls: "seg-confirmed", n: funnel.confirmed, label: "Confirmed" },
    { cls: "seg-awaiting", n: funnel.awaiting, label: "Awaiting confirmation" },
    { cls: "seg-joined", n: pending + (funnel.submitted - funnel.confirmed - funnel.awaiting), label: "Joined, result pending" },
    { cls: "seg-none", n: funnel.noReply, label: "No reply" },
    { cls: "seg-declined", n: funnel.declined, label: "Declined" },
  ];
  return (
    <div>
      <div className="funnel" role="img" aria-label={`${funnel.confirmed} confirmed, ${funnel.awaiting} awaiting confirmation, ${funnel.noReply} no reply, ${funnel.declined} declined, of ${funnel.invited} invited`}>
        {segs.filter((s) => s.n > 0).map((s) => (
          <span key={s.label} className={`funnel-seg ${s.cls}`} style={{ flexGrow: s.n, flexBasis: `${(s.n / total) * 100}%` }} title={`${s.label}: ${s.n}`} />
        ))}
        {funnel.invited === 0 && <span className="funnel-seg seg-none" style={{ flexGrow: 1 }} />}
      </div>
      {!compact && (
        <ul className="funnel-legend">
          {segs.map((s) => (
            <li key={s.label}><span className={`funnel-dot ${s.cls}`} aria-hidden="true" /> {s.label} <strong>{s.n}</strong></li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The four numbers an organiser reads first. */
export function FunnelFigures({ funnel }: { funnel: Funnel }) {
  const figs = [
    ["Invited", funnel.invited],
    ["Joined", funnel.joined],
    ["Submitted", funnel.submitted],
    ["Confirmed", funnel.confirmed],
  ] as const;
  return (
    <dl className="figures">
      {figs.map(([k, v]) => (
        <div key={k}>
          <dd>{v}</dd>
          <dt>{k}</dt>
        </div>
      ))}
    </dl>
  );
}
