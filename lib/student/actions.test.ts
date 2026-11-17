import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn(), getSessionProfile: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: vi.fn(async () => ({ rpc: m.rpc })) }));
vi.mock("@/lib/session", () => ({ getSessionProfile: m.getSessionProfile }));

import { respond, submitResult, requestCorrection } from "@/lib/student/actions";

beforeEach(() => {
  m.rpc.mockReset();
  m.rpc.mockResolvedValue({ data: null, error: null });
  m.getSessionProfile.mockResolvedValue({ id: "s1", role: "student", fullName: "S" });
});

describe("student actions", () => {
  it("respond calls respond_to_invitation", async () => {
    await respond("i1", "joined");
    expect(m.rpc).toHaveBeenCalledWith("respond_to_invitation", { p_invitation_id: "i1", p_status: "joined" });
  });
  it("submitResult trims and passes the proof path", async () => {
    await submitResult("i1", "  Won 1st  ", " ", "s1/abc.pdf");
    expect(m.rpc).toHaveBeenCalledWith("submit_result", { p_invitation_id: "i1", p_outcome: "Won 1st", p_details: null, p_proof_path: "s1/abc.pdf" });
  });
  it("requestCorrection calls request_correction", async () => {
    await requestCorrection("r1", "Won", "d", null);
    expect(m.rpc).toHaveBeenCalledWith("request_correction", { p_result_id: "r1", p_outcome: "Won", p_details: "d", p_proof_path: null });
  });
  it("refuses a blank outcome before calling the database", async () => {
    await expect(submitResult("i1", "  ", "", null)).rejects.toThrow(/result/i);
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it.each(["faculty", "admin", "principal"])("refuses a %s", async (role) => {
    m.getSessionProfile.mockResolvedValue({ id: "x", role, fullName: "X" });
    await expect(respond("i1", "joined")).rejects.toThrow(/students/i);
    await expect(submitResult("i1", "o", "", null)).rejects.toThrow(/students/i);
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it("surfaces a database refusal such as a passed deadline", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: "the deadline has passed" } });
    await expect(respond("i1", "joined")).rejects.toThrow(/deadline/);
  });
});
