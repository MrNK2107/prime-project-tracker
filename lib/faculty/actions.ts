import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/session";
import { istInputToIso } from "@/lib/time";
import { safeHttpsUrl } from "@/lib/url";

export const ITEM_TYPES = ["hackathon", "internship", "event", "meeting"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export type NewItem = {
  type: ItemType;
  title: string;
  description: string;
  meetingUrl: string;
  startsAt: string;
  deadline: string;
  requiresConfirmation: boolean;
  requiresProof: boolean;
  groupIds: string[];
  departmentIds: string[];
  years: number[];
  studentIds: string[];
};

async function requireFaculty() {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "faculty") throw new Error("Only faculty can do this.");
}

/**
 * Creates an event and invites the targeted students. The database drops any student the caller is
 * not allowed to see (so a stray id cannot reach outside your students). Meeting links must be https.
 */
export async function createItem(input: NewItem): Promise<string> {
  await requireFaculty();
  const title = input.title.trim();
  if (!title) throw new Error("Enter a title.");
  if (!ITEM_TYPES.includes(input.type)) throw new Error("Choose what kind of event this is.");

  let meetingUrl: string | null = null;
  if (input.meetingUrl.trim()) {
    meetingUrl = safeHttpsUrl(input.meetingUrl);
    if (!meetingUrl) throw new Error("The meeting link must start with https://");
  }
  if (input.groupIds.length + input.departmentIds.length + input.years.length + input.studentIds.length === 0) {
    throw new Error("Choose who this is for: your mentees, a group, a department, a year or specific students.");
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("create_item", {
    p_item: {
      type: input.type,
      title,
      description: input.description.trim() || null,
      meeting_url: meetingUrl,
      starts_at: istInputToIso(input.startsAt),
      deadline: istInputToIso(input.deadline),
      requires_confirmation: input.requiresConfirmation,
      requires_proof: input.requiresProof,
    },
    p_group_ids: input.groupIds,
    p_department_ids: input.departmentIds,
    p_years: input.years,
    p_student_ids: input.studentIds,
  });
  if (error) throw new Error(error.message || "The event could not be created.");
  return String(data);
}

export type EventEdit = { title: string; description: string; meetingUrl: string; startsAt: string; deadline: string };

/**
 * Edits an event's wording and dates. The database allows the event's creator and a coordinator of a group
 * the event reaches, and nobody else. Who is invited and what is required cannot change here.
 */
export async function updateEvent(eventId: string, input: EventEdit): Promise<void> {
  await requireFaculty();
  const title = input.title.trim();
  if (!title) throw new Error("Enter a title.");
  let meetingUrl: string | null = null;
  if (input.meetingUrl.trim()) {
    meetingUrl = safeHttpsUrl(input.meetingUrl);
    if (!meetingUrl) throw new Error("The meeting link must start with https://");
  }
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("update_item", {
    p_item_id: eventId,
    p_changes: {
      title,
      description: input.description.trim() || null,
      meeting_url: meetingUrl,
      starts_at: istInputToIso(input.startsAt),
      deadline: istInputToIso(input.deadline),
    },
  });
  if (error) throw new Error(error.code === "42501" ? "You cannot edit this event." : error.message || "The event could not be saved.");
}

/** Confirms a result or sends it back with a note. The database re-checks who is allowed at this moment. */
export async function reviewResult(resultId: string, decision: "confirm" | "send_back", note: string): Promise<void> {
  await requireFaculty();
  const clean = note.trim();
  if (decision === "send_back" && !clean) throw new Error("Add a note so the student knows what to fix.");
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("review_result", { p_result_id: resultId, p_decision: decision, p_note: clean || null });
  if (error) throw new Error(error.message || "The review could not be saved.");
}
