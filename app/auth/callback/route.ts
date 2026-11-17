import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

/** Completes an emailed link (token_hash flow) and sends the user on; the proxy then routes by role. */
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  if (tokenHash) {
    const supabase = await createServerClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
    if (!error) return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.redirect(new URL("/login", request.url));
}
