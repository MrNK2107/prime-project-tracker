import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/session";

async function requireStudent() {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "student") throw new Error("Only students can do this.");
  return profile;
}

async function call(fn: string, args: Record<string, unknown>) {
  await requireStudent();
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message || "That could not be saved.");
  return data;
}

/** Join or decline an item. The database refuses after the deadline, and refuses leaving once a result exists. */
export async function respond(invitationId: string, status: "joined" | "declined"): Promise<void> {
  if (status !== "joined" && status !== "declined") throw new Error("Choose join or decline.");
  await call("respond_to_invitation", { p_invitation_id: invitationId, p_status: status });
}

function clean(outcome: string, details: string) {
  const o = outcome.trim();
  if (!o) throw new Error("Say what the result was.");
  return { o, d: details.trim() || null };
}

/** First result, or a resubmission after the result was sent back. proofPath must already be uploaded to your own folder. */
export async function submitResult(invitationId: string, outcome: string, details: string, proofPath: string | null): Promise<void> {
  const { o, d } = clean(outcome, details);
  await call("submit_result", { p_invitation_id: invitationId, p_outcome: o, p_details: d, p_proof_path: proofPath });
}

/** A change to a confirmed result: it goes to review, and the old value keeps counting until then. */
export async function requestCorrection(resultId: string, outcome: string, details: string, proofPath: string | null): Promise<void> {
  const { o, d } = clean(outcome, details);
  await call("request_correction", { p_result_id: resultId, p_outcome: o, p_details: d, p_proof_path: proofPath });
}
