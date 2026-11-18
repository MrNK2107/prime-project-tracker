import { coordinatedStudentIds, type Scope } from "@/lib/faculty/scope";
import type { EventTrack } from "@/lib/faculty/tracking";

/** Mirrors update_item in the database (which decides for real): the creator, or a coordinator of a group the event reaches. */
export function canEditEvent(event: Pick<EventTrack, "mine" | "participants">, scope: Scope): boolean {
  if (event.mine) return true;
  const coordinated = coordinatedStudentIds(scope);
  return event.participants.some((p) => coordinated.has(p.studentId));
}
