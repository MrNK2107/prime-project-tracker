"use server";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { isAllowedEmail } from "@/lib/routing";

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
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) return { step: "code", email, error: GENERIC };
  redirect("/");
}
