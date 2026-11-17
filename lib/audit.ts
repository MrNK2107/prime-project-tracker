import "server-only";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Append one event to audit_log (spec Decision 11). Used for events that are not row
 * changes, which the database triggers already log: proof views/downloads and profile opens.
 *
 * The actor is the signed-in user of the current request (null when there is no session).
 * The row is written with the service client; audit_log is append-only for every role.
 *
 * Profile opens are best effort: for action 'profile_open' failures are swallowed with a
 * single console.warn (no ids, no error text). Every other action throws on failure so the
 * caller can refuse the audited operation (for example, not serve a proof file).
 *
 * Never pass result text, emails or names in `detail`.
 */
export async function logEvent(
  action: string,
  entity: string,
  entityId: string,
  detail?: Record<string, unknown>,
): Promise<void> {
  try {
    const supabase = await createServerClient();
    const { data } = await supabase.auth.getUser();
    const actorId = data?.user?.id ?? null;

    const { error } = await createServiceClient()
      .from("audit_log")
      .insert({
        actor_id: actorId,
        action,
        entity,
        entity_id: entityId,
        detail: detail ?? {},
      });
    if (error) throw new Error(`audit log insert failed: ${error.message}`);
  } catch (err) {
    if (action === "profile_open") {
      console.warn("audit: profile_open event could not be recorded");
      return;
    }
    throw err;
  }
}
