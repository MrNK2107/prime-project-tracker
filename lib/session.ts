import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/routing";

export type SessionProfile = { id: string; role: UserRole; fullName: string };

/**
 * The signed-in user's profile, or null when there is no session, no profiles row,
 * or the account is deactivated. Invite-only: a valid Supabase session alone is not enough.
 */
export async function getSessionProfile(): Promise<SessionProfile | null> {
  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, full_name, active")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (error || !data || data.active !== true) return null;

  return { id: data.id as string, role: data.role as UserRole, fullName: (data.full_name as string) ?? "" };
}
