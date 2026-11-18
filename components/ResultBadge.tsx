import { ShieldCheck, Clock, Undo2 } from "lucide-react";
import type { ResultState } from "@/lib/results";

/** Confirmed (sealed) and unconfirmed (claimed) results must always look different. */
export function ResultBadge({ state }: { state: ResultState }) {
  if (state === "sealed") {
    return (
      <span className="badge badge-seal">
        <ShieldCheck size={14} aria-hidden="true" /> Confirmed
      </span>
    );
  }
  if (state === "sent_back") {
    return (
      <span className="badge badge-neutral">
        <Undo2 size={14} aria-hidden="true" /> Sent back
      </span>
    );
  }
  return (
    <span className="badge badge-claim">
      <Clock size={14} aria-hidden="true" /> Awaiting confirmation
    </span>
  );
}

export const TYPE_LABEL: Record<string, string> = { hackathon: "Hackathon", internship: "Internship", event: "Other event", meeting: "Meeting" };
