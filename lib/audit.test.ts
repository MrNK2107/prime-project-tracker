import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const insert = vi.fn();
const from = vi.fn(() => ({ insert }));
const getUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({ auth: { getUser } })),
  createServiceClient: vi.fn(() => ({ from })),
}));

import { logEvent } from "@/lib/audit";

const ACTOR = "22222222-0000-0000-0000-000000000001";

describe("logEvent", () => {
  beforeEach(() => {
    insert.mockReset();
    from.mockClear();
    getUser.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: ACTOR } }, error: null });
    insert.mockResolvedValue({ error: null });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("inserts exactly one row with the session user as actor", async () => {
    await logEvent("proof_view", "results", "r-1", { path: "x" });
    expect(from).toHaveBeenCalledWith("audit_log");
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith({
      actor_id: ACTOR,
      action: "proof_view",
      entity: "results",
      entity_id: "r-1",
      detail: { path: "x" },
    });
  });

  it("defaults detail to {} (never null)", async () => {
    await logEvent("proof_view", "results", "r-1");
    expect(insert.mock.calls[0][0].detail).toEqual({});
  });

  it("uses a null actor when there is no session", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: "no session" } });
    await logEvent("proof_view", "results", "r-1");
    expect(insert.mock.calls[0][0].actor_id).toBeNull();
  });

  it("profile_open does not throw when the insert fails, and warns once without PII", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    insert.mockResolvedValue({ error: { message: "db down for someone@example.org" } });
    await expect(
      logEvent("profile_open", "profiles", "11111111-0000-0000-0000-000000000001"),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("someone@example.org");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("11111111-0000-0000-0000-000000000001");
  });

  it("profile_open does not throw when resolving the session throws", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    getUser.mockRejectedValue(new Error("cookies unavailable"));
    await expect(logEvent("profile_open", "profiles", "p-1")).resolves.toBeUndefined();
  });

  it("proof_view throws when the insert fails", async () => {
    insert.mockResolvedValue({ error: { message: "insert failed" } });
    await expect(logEvent("proof_view", "results", "r-1")).rejects.toThrow(/audit/i);
  });

  it("proof_view throws when the insert itself rejects", async () => {
    insert.mockRejectedValue(new Error("network"));
    await expect(logEvent("proof_view", "results", "r-1")).rejects.toThrow();
  });
});
