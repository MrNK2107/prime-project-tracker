import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { resolveRedirect, type UserRole } from "@/lib/routing";

/** Refreshes the Supabase session and applies the role-based redirects (optimistic only). */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  let session: { role: UserRole } | null = null;
  const { data: auth } = await supabase.auth.getUser();
  if (auth?.user) {
    const { data } = await supabase
      .from("profiles")
      .select("role, active")
      .eq("id", auth.user.id)
      .maybeSingle();
    if (data && data.active === true) session = { role: data.role as UserRole };
  }

  const target = resolveRedirect(request.nextUrl.pathname, session);
  if (target && target !== request.nextUrl.pathname) {
    const redirect = NextResponse.redirect(new URL(target, request.url));
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }
  return response;
}

export const config = {
  // API routes authenticate themselves (401/404); skip static assets.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
