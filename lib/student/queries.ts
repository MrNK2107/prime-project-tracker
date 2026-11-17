import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { summarizeResults, type ResultRow, type ResultView } from "@/lib/results";
import { safeHttpsUrl } from "@/lib/url";

export type InvitationRow = {
  invitationId: string;
  status: "invited" | "joined" | "declined";
  item: {
    id: string;
    title: string;
    type: string;
    description: string | null;
    meetingUrl: string | null;
    startsAt: string | null;
    deadline: string | null;
    deadlinePassed: boolean;
    requiresConfirmation: boolean;
    requiresProof: boolean;
  };
  result: ResultView | null;
  pendingCorrection: ResultView | null;
  /** True when the student may submit a first result or a resubmission after a send-back. */
  canSubmit: boolean;
};

type Row = Record<string, unknown>;
const str = (v: unknown) => String(v ?? "");

/** The signed-in student's own invitations, newest item first. Only their own rows are ever returned. */
export async function listMyInvitations(now: Date = new Date()): Promise<InvitationRow[]> {
  const sb = await createServerClient();
  const { data: auth } = await sb.auth.getUser();
  const me = auth?.user?.id;
  if (!me) return [];

  const invitations = await sb.from("invitations").select("id, item_id, student_id, status").eq("student_id", me);
  if (invitations.error) throw new Error("Could not load your items.");
  const invs = (invitations.data as Row[]).filter((i) => str(i.student_id) === me);
  if (invs.length === 0) return [];

  const [items, results] = await Promise.all([
    sb.from("items").select("id, title, type, description, meeting_url, starts_at, deadline, requires_confirmation, requires_proof, created_at").in("id", [...new Set(invs.map((i) => str(i.item_id)))]),
    sb.from("results").select("id, invitation_id, revision, outcome, details, proof_path, status, review_note, submitted_at").in("invitation_id", invs.map((i) => str(i.id))),
  ]);
  if (items.error || results.error) throw new Error("Could not load your items.");

  const item = new Map((items.data as Row[]).map((i) => [str(i.id), i]));
  const byInv = new Map<string, ResultRow[]>();
  for (const r of results.data as Row[]) {
    const list = byInv.get(str(r.invitation_id)) ?? [];
    list.push(r as unknown as ResultRow);
    byInv.set(str(r.invitation_id), list);
  }

  const rows: (InvitationRow & { createdAt: string })[] = [];
  for (const i of invs) {
    const it = item.get(str(i.item_id));
    if (!it) continue;
    const deadline = (it.deadline as string | null) ?? null;
    const summary = summarizeResults(byInv.get(str(i.id)) ?? []);
    const deadlinePassed = deadline ? new Date(deadline).getTime() < now.getTime() : false;
    rows.push({
      invitationId: str(i.id),
      status: i.status as InvitationRow["status"],
      item: {
        id: str(it.id),
        title: str(it.title),
        type: str(it.type),
        description: (it.description as string | null) ?? null,
        // Only https links are ever shown as links.
        meetingUrl: safeHttpsUrl(it.meeting_url as string | null),
        startsAt: (it.starts_at as string | null) ?? null,
        deadline,
        deadlinePassed,
        requiresConfirmation: it.requires_confirmation === true,
        requiresProof: it.requires_proof === true,
      },
      ...summary,
      canSubmit: i.status === "joined" && (summary.result === null || summary.result.state === "sent_back"),
      createdAt: str(it.created_at),
    });
  }
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return rows.map(({ createdAt, ...rest }) => (void createdAt, rest));
}
