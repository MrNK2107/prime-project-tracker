import { NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { logEvent } from "@/lib/audit";
import { PROOF_BUCKET } from "@/lib/proof";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIGNED_URL_SECONDS = 60;

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * GET /api/proof/[resultId] -> { url } (a 60-second signed URL for the result's proof file).
 *
 * Visibility is decided by RLS on results through the caller's own client: whoever can
 * read the result (the student, mentor, group lead, HOD, principal, item creator) can view
 * its proof; everyone else, admin included, gets 404. Every view is audit-logged before
 * the URL is created; if logging fails no URL is returned. The storage path is never sent.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ resultId: string }> },
) {
  const { resultId } = await params;

  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return json({ error: "unauthorized" }, 401);

  if (!UUID.test(resultId)) return json({ error: "not found" }, 404);

  const { data: row, error } = await supabase
    .from("results")
    .select("proof_path")
    .eq("id", resultId)
    .maybeSingle();
  if (error) return json({ error: "could not load the result" }, 500);
  if (!row?.proof_path) return json({ error: "not found" }, 404);

  try {
    await logEvent("proof_view", "result", resultId);
  } catch {
    return json({ error: "could not record the proof view" }, 500);
  }

  const { data: signed, error: signError } = await createServiceClient()
    .storage.from(PROOF_BUCKET)
    .createSignedUrl(row.proof_path as string, SIGNED_URL_SECONDS);
  if (signError || !signed?.signedUrl) return json({ error: "could not open the proof file" }, 500);

  return json({ url: signed.signedUrl }, 200);
}
