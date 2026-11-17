import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser = vi.fn();
const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ maybeSingle }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({ auth: { getUser }, from })),
}));

import { getSessionProfile } from "@/lib/session";

const ID = "11111111-0000-0000-0000-000000000001";

describe("getSessionProfile", () => {
  beforeEach(() => {
    getUser.mockReset();
    maybeSingle.mockReset();
    from.mockClear();
    getUser.mockResolvedValue({ data: { user: { id: ID } }, error: null });
  });

  it("is null when unauthenticated, without querying profiles", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect(await getSessionProfile()).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it("is null when there is no profiles row", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await getSessionProfile()).toBeNull();
  });

  it("is null when the profile is inactive", async () => {
    maybeSingle.mockResolvedValue({
      data: { id: ID, role: "student", full_name: "A", active: false },
      error: null,
    });
    expect(await getSessionProfile()).toBeNull();
  });

  it("is null when the profile query fails", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await getSessionProfile()).toBeNull();
  });

  it("returns the profile for an active student", async () => {
    maybeSingle.mockResolvedValue({
      data: { id: ID, role: "student", full_name: "Asha", active: true },
      error: null,
    });
    expect(await getSessionProfile()).toEqual({ id: ID, role: "student", fullName: "Asha" });
    expect(from).toHaveBeenCalledWith("profiles");
    expect(eq).toHaveBeenCalledWith("id", ID);
  });
});
