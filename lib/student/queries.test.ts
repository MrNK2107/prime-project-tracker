import { describe, it, expect, vi } from "vitest";
import { mockSupabase } from "@/tests/helpers/mockSupabase";

const m = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: vi.fn(async () => m.client) }));

import { listMyInvitations } from "@/lib/student/queries";

const ME = "11111111-0000-0000-0000-000000000001";
const OTHER = "11111111-0000-0000-0000-000000000002";

const items = [
  { id: "it1", title: "Hackathon", type: "hackathon", description: null, meeting_url: "javascript:alert(1)", starts_at: null, deadline: "2026-12-01T00:00:00Z", requires_confirmation: true, requires_proof: true, created_at: "2026-11-01" },
  { id: "it2", title: "Meeting", type: "meeting", description: "d", meeting_url: "https://meet.google.com/x", starts_at: null, deadline: "2026-01-01T00:00:00Z", requires_confirmation: false, requires_proof: false, created_at: "2026-11-02" },
];

function use(tables: Record<string, Record<string, unknown>[]>, user: string | null = ME) {
  m.client = mockSupabase(tables, user).client;
}

describe("listMyInvitations", () => {
  it("returns only the caller's rows, even if other rows were somehow supplied", async () => {
    use({
      invitations: [
        { id: "i1", item_id: "it1", student_id: ME, status: "invited" },
        { id: "i2", item_id: "it2", student_id: OTHER, status: "joined" },
      ],
      items,
      results: [],
    });
    const rows = await listMyInvitations(new Date("2026-11-17"));
    expect(rows.map((r) => r.invitationId)).toEqual(["i1"]);
  });
  it("is empty (not an error) when there are no invitations, and when signed out", async () => {
    use({ invitations: [], items: [], results: [] });
    expect(await listMyInvitations()).toEqual([]);
    use({ invitations: [{ id: "i1", item_id: "it1", student_id: ME, status: "invited" }], items, results: [] }, null);
    expect(await listMyInvitations()).toEqual([]);
  });
  it("never exposes a non-https meeting link, keeps an https one", async () => {
    use({
      invitations: [
        { id: "i1", item_id: "it1", student_id: ME, status: "joined" },
        { id: "i2", item_id: "it2", student_id: ME, status: "joined" },
      ],
      items,
      results: [],
    });
    const rows = await listMyInvitations(new Date("2026-11-17"));
    expect(rows.find((r) => r.invitationId === "i1")?.item.meetingUrl).toBeNull();
    expect(rows.find((r) => r.invitationId === "i2")?.item.meetingUrl).toBe("https://meet.google.com/x");
  });
  it("flags a passed deadline", async () => {
    use({ invitations: [{ id: "i2", item_id: "it2", student_id: ME, status: "invited" }], items, results: [] });
    expect((await listMyInvitations(new Date("2026-11-17")))[0].item.deadlinePassed).toBe(true);
  });
  it("lets a joined student submit when there is no result or it was sent back, not while it waits or is confirmed", async () => {
    const inv = (id: string) => ({ id, item_id: "it1", student_id: ME, status: "joined" });
    const res = (inv: string, status: string, revision = 1) => ({ id: `r-${inv}-${revision}`, invitation_id: inv, revision, outcome: "o", details: null, proof_path: null, status, review_note: status === "sent_back" ? "fix" : null, submitted_at: "2026-11-05" });
    use({
      invitations: [inv("none"), inv("waiting"), inv("back"), inv("done")],
      items,
      results: [res("waiting", "submitted"), res("back", "sent_back"), res("done", "confirmed")],
    });
    const by = Object.fromEntries((await listMyInvitations(new Date("2026-11-17"))).map((r) => [r.invitationId, r.canSubmit]));
    expect(by).toEqual({ none: true, waiting: false, back: true, done: false });
  });
  it("keeps a confirmed result counting while a correction is pending", async () => {
    use({
      invitations: [{ id: "i1", item_id: "it1", student_id: ME, status: "joined" }],
      items,
      results: [
        { id: "r1", invitation_id: "i1", revision: 1, outcome: "Won", details: null, proof_path: null, status: "confirmed", review_note: null, submitted_at: "2026-11-05" },
        { id: "r2", invitation_id: "i1", revision: 2, outcome: "Won 1st", details: null, proof_path: null, status: "submitted", review_note: null, submitted_at: "2026-11-06" },
      ],
    });
    const [row] = await listMyInvitations(new Date("2026-11-17"));
    expect(row.result).toMatchObject({ outcome: "Won", state: "sealed" });
    expect(row.pendingCorrection).toMatchObject({ outcome: "Won 1st", state: "claimed" });
  });
});
