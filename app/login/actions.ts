"use server";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { homeFor, isAllowedEmail, type UserRole } from "@/lib/routing";

export type LoginState = { step: "email" | "code"; email?: string; error?: string };

const GENERIC = "Could not sign in with those details.";

/**
 * Step 1: send a one-time code. Wrong-domain addresses are rejected before anything is sent.
 * shouldCreateUser is false: only accounts an admin created can sign in (invite-only).
 */
export async function requestCode(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!isAllowedEmail(email, process.env.ALLOWED_EMAIL_DOMAIN)) {
    return { step: "email", error: "Use your college email address." };
  }
  const supabase = await createServerClient();
  await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  // Same answer whether or not the account exists, so addresses cannot be probed.
  return { step: "code", email };
}

/** Step 2: verify the code, then let the proxy route the user to their home. */
export async function verifyCode(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const token = String(form.get("token") ?? "").trim();
  if (!isAllowedEmail(email, process.env.ALLOWED_EMAIL_DOMAIN) || !/^\d{6,10}$/.test(token)) {
    return { step: "code", email, error: GENERIC };
  }
  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error || !data.user) return { step: "code", email, error: GENERIC };

  // Invite-only: a valid code is not enough, the account needs an active profile.
  const { data: profile } = await supabase.from("profiles").select("role, active").eq("id", data.user.id).maybeSingle();
  if (!profile || profile.active !== true) {
    await supabase.auth.signOut();
    return { step: "code", email, error: GENERIC };
  }
  redirect(homeFor(profile.role as UserRole));
}
