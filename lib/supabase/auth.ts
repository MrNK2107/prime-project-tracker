import "server-only";
import { cache } from "react";
import { createServerClient } from "@/lib/supabase/server";

/**
 * The signed-in user's id, or null. Asked once per request however many queries need it: React's `cache` shares the
 * answer, and `getClaims` checks the session token's signature locally instead of calling the auth server (a full
 * network round trip) every time. The session is refreshed in proxy.ts; a deactivated account is still stopped by its
 * profile row (every query returns nothing for it), so a not-yet-expired token buys nothing.
 */
export const currentUserId = cache(async (): Promise<string | null> => {
  const sb = await createServerClient();
  const auth = sb.auth as unknown as {
    getClaims?: () => Promise<{ data: { claims?: { sub?: string } } | null; error: unknown }>;
    getUser: () => Promise<{ data: { user: { id: string } | null } }>;
  };
  if (typeof auth.getClaims === "function") {
    const { data } = await auth.getClaims();
    if (data?.claims?.sub) return String(data.claims.sub);
  }
  // No usable local claims (signed out, or a project that signs tokens with a shared secret): ask the auth server.
  const { data } = await auth.getUser();
  return data?.user?.id ?? null;
});
