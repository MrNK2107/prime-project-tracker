"use server";
import { redirect } from "next/navigation";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { homeFor, isAllowedEmail, type UserRole } from "@/lib/routing";
import { parseIdentifier } from "@/lib/identifier";

export type LoginState = { error?: string; identifier?: string };

const GENERIC = "Could not sign in with those details.";

/**
 * Sign in with an email or a register number plus a password. A register number is looked up
 * server-side (service role) to find the account's email; the browser never sees that lookup.
 * Every failure gives the same answer so accounts cannot be probed. Invite-only: a correct
 * password is not enough, the account also needs an active profile.
 */
export async function signIn(_prev: LoginState, form: FormData): Promise<LoginState> {
  const raw = String(form.get("identifier") ?? "");
  const password = String(form.get("password") ?? "");
  const id = parseIdentifier(raw);
  if (!id || !password || password.length > 72) return { identifier: raw, error: GENERIC };

  let email: string;
  if (id.kind === "email") {
    if (!isAllowedEmail(id.value, process.env.ALLOWED_EMAIL_DOMAIN)) {
      return { identifier: raw, error: "Use your college email address or your register number." };
    }
    email = id.value;
  } else {
    // Register numbers are stored upper-case by the app; the unique index is on upper(register_no).
    const { data } = await createServiceClient().from("profiles").select("email").eq("register_no", id.value).maybeSingle();
    if (!data?.email) return { identifier: raw, error: GENERIC };
    email = data.email as string;
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { identifier: raw, error: GENERIC };

  const { data: profile } = await supabase.from("profiles").select("role, active").eq("id", data.user.id).maybeSingle();
  if (!profile || profile.active !== true) {
    await supabase.auth.signOut();
    return { identifier: raw, error: GENERIC };
  }
  redirect(homeFor(profile.role as UserRole));
}
