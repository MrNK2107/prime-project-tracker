import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { homeFor, type UserRole } from "@/lib/routing";

/**
 * Completes a one-time sign-in link (token_hash flow): verifies it, checks the account is active
 * (invite-only), then sends the user to their own home. Anything else goes back to the sign-in page.
 */
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const rawType = request.nextUrl.searchParams.get("type");
  const type = rawType === "magiclink" ? "magiclink" : "email";
  const toLogin = () => NextResponse.redirect(new URL("/login", request.url));
  if (!tokenHash) return toLogin();

  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error || !data.user) return toLogin();

  const { data: profile } = await supabase.from("profiles").select("role, active").eq("id", data.user.id).maybeSingle();
  if (!profile || profile.active !== true) {
    await supabase.auth.signOut();
    return toLogin();
  }
  return NextResponse.redirect(new URL(homeFor(profile.role as UserRole), request.url));
}
