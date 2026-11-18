"use server";
import { createServerClient } from "@/lib/supabase/server";
import { passwordProblem } from "@/lib/identifier";
import type { FormResult } from "@/components/ActionForm";

/** Changes the signed-in user's own password. The current password is checked first. */
export async function changePasswordAction(_p: FormResult, d: FormData): Promise<FormResult> {
  const current = String(d.get("current") ?? "");
  const next = String(d.get("next") ?? "");
  const problem = passwordProblem(next);
  if (problem) return { ok: false, message: problem };
  if (next === current) return { ok: false, message: "Choose a password different from the current one." };

  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const email = auth?.user?.email;
  if (!email) return { ok: false, message: "Please sign in again." };

  const { error: checkError } = await supabase.auth.signInWithPassword({ email, password: current });
  if (checkError) return { ok: false, message: "The current password is not correct." };
  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) return { ok: false, message: "The password could not be changed." };
  return { ok: true, message: "Password changed." };
}
