import { timingSafeEqual } from "node:crypto";
import { refreshSuggestions } from "@/lib/suggestions/refresh";

export const maxDuration = 120;

function authorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // never open without a secret
  const given = req.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  return given.length === want.length && timingSafeEqual(Buffer.from(given), Buffer.from(want));
}

/**
 * Refreshes the event suggestions from the two Google Sheets. Vercel Cron calls this daily (see vercel.json) and sends
 * `Authorization: Bearer $CRON_SECRET`; the same call works by hand:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/cron/refresh-suggestions
 */
export async function GET(req: Request) {
  if (!authorised(req)) return Response.json({ error: "Not allowed" }, { status: 401 });
  try {
    return Response.json({ ok: true, ...(await refreshSuggestions()) });
  } catch (e) {
    console.error("refresh-suggestions failed:", e instanceof Error ? e.message : e);
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "Refresh failed" }, { status: 502 });
  }
}
