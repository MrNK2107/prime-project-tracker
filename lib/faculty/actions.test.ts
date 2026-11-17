import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn(), getSessionProfile: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: vi.fn(async () => ({ rpc: m.rpc })) }));
vi.mock("@/lib/session", () => ({ getSessionProfile: m.getSessionProfile }));

import { createItem, reviewResult, type NewItem } from "@/lib/faculty/actions";

const ITEM: NewItem = {
  type: "hackathon",
  title: "  Smart India Hackathon ",
  description: "Team event",
  meetingUrl: "",
  startsAt: "2026-11-20T10:30",
  deadline: "2026-11-18T17:00",
  requiresConfirmation: true,
  requiresProof: false,
  groupIds: ["g1"],
  departmentIds: [],
  years: [2, 3],
  studentIds: ["s1"],
};

beforeEach(() => {
  m.rpc.mockReset();
  m.rpc.mockResolvedValue({ data: "item-1", error: null });
  m.getSessionProfile.mockResolvedValue({ id: "f1", role: "faculty", fullName: "F" });
});

describe("createItem", () => {
  it("calls create_item with the item as JSON and the targets", async () => {
    expect(await createItem(ITEM)).toBe("item-1");
    const [fn, args] = m.rpc.mock.calls[0];
    expect(fn).toBe("create_item");
    expect(args.p_item).toMatchObject({
      type: "hackathon",
      title: "Smart India Hackathon",
      starts_at: "2026-11-20T10:30:00+05:30",
      deadline: "2026-11-18T17:00:00+05:30",
      requires_confirmation: true,
      requires_proof: false,
    });
    expect(args).toMatchObject({ p_group_ids: ["g1"], p_department_ids: [], p_years: [2, 3], p_student_ids: ["s1"] });
  });
  it.each(["student", "admin", "principal"])("refuses a %s", async (role) => {
    m.getSessionProfile.mockResolvedValue({ id: "x", role, fullName: "X" });
    await expect(createItem(ITEM)).rejects.toThrow(/faculty/i);
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it("refuses a missing title", async () => {
    await expect(createItem({ ...ITEM, title: "   " })).rejects.toThrow(/title/i);
  });
  it.each(["javascript:alert(1)", "http://meet.google.com/x", "meet.google.com/x"])("refuses the meeting link %s", async (url) => {
    await expect(createItem({ ...ITEM, type: "meeting", meetingUrl: url })).rejects.toThrow(/https/i);
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it("keeps an https meeting link", async () => {
    await createItem({ ...ITEM, type: "meeting", meetingUrl: "https://meet.google.com/abc" });
    expect(m.rpc.mock.calls[0][1].p_item.meeting_url).toBe("https://meet.google.com/abc");
  });
  it("refuses an item with no targets at all", async () => {
    await expect(createItem({ ...ITEM, groupIds: [], departmentIds: [], years: [], studentIds: [] })).rejects.toThrow(/choose who/i);
  });
  it("surfaces a database refusal", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: "only active faculty can create items" } });
    await expect(createItem(ITEM)).rejects.toThrow(/active faculty/);
  });
});

describe("reviewResult", () => {
  it("confirms", async () => {
    await reviewResult("r1", "confirm", "");
    expect(m.rpc).toHaveBeenCalledWith("review_result", { p_result_id: "r1", p_decision: "confirm", p_note: null });
  });
  it("requires a note to send back", async () => {
    await expect(reviewResult("r1", "send_back", "  ")).rejects.toThrow(/note/i);
    expect(m.rpc).not.toHaveBeenCalled();
    await reviewResult("r1", "send_back", "Please attach the certificate");
    expect(m.rpc).toHaveBeenCalledWith("review_result", { p_result_id: "r1", p_decision: "send_back", p_note: "Please attach the certificate" });
  });
  it("refuses non-faculty", async () => {
    m.getSessionProfile.mockResolvedValue({ id: "s", role: "student", fullName: "S" });
    await expect(reviewResult("r1", "confirm", "")).rejects.toThrow(/faculty/i);
  });
});
