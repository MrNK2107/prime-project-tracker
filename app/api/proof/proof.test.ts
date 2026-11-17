import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------- mocks
const getUser = vi.fn();
const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ maybeSingle }));
const select = vi.fn(() => ({ eq }));
const fromUser = vi.fn(() => ({ select }));

const createSignedUrl = vi.fn();
const storageFrom = vi.fn(() => ({ createSignedUrl }));

const logEvent = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({ auth: { getUser }, from: fromUser })),
  createServiceClient: vi.fn(() => ({ storage: { from: storageFrom } })),
}));
vi.mock("@/lib/audit", () => ({ logEvent: (...args: unknown[]) => logEvent(...args) }));

import { GET } from "@/app/api/proof/[resultId]/route";

const USER = "22222222-0000-0000-0000-000000000001";
const RESULT = "9f1c2e4a-5b6d-4e7f-8a9b-0c1d2e3f4a5b";
const PATH = "11111111-0000-0000-0000-000000000001/aaaaaaaa-1111-4111-8111-000000000001.pdf";
const SIGNED = "http://127.0.0.1:54321/storage/v1/object/sign/proofs/x?token=t";

function call(resultId: string) {
  return GET(new Request(`http://localhost/api/proof/${resultId}`), {
    params: Promise.resolve({ resultId }),
  });
}

describe("GET /api/proof/[resultId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: USER } }, error: null });
    maybeSingle.mockResolvedValue({ data: { proof_path: PATH }, error: null });
    logEvent.mockResolvedValue(undefined);
    createSignedUrl.mockResolvedValue({ data: { signedUrl: SIGNED }, error: null });
  });

  it("401 without a session, and nothing is logged or signed", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: "no session" } });
    const res = await call(RESULT);
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(logEvent).not.toHaveBeenCalled();
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("404 for a non-uuid id, without querying, logging or signing", async () => {
    for (const bad of ["abc", "../x", `${RESULT}x`, "9F1C2E4A-5B6D-4E7F-8A9B-0C1D2E3F4A5B ; drop"]) {
      const res = await call(bad);
      expect(res.status).toBe(404);
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
    expect(fromUser).not.toHaveBeenCalled();
    expect(logEvent).not.toHaveBeenCalled();
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("404 when RLS hides the result (or it does not exist); nothing logged", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await call(RESULT);
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(fromUser).toHaveBeenCalledWith("results");
    expect(select).toHaveBeenCalledWith("proof_path");
    expect(eq).toHaveBeenCalledWith("id", RESULT);
    expect(logEvent).not.toHaveBeenCalled();
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("404 when the result has no proof file; nothing logged", async () => {
    maybeSingle.mockResolvedValue({ data: { proof_path: null }, error: null });
    const res = await call(RESULT);
    expect(res.status).toBe(404);
    expect(logEvent).not.toHaveBeenCalled();
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("200 with a 60-second signed URL; logs one proof_view before signing", async () => {
    const res = await call(RESULT);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body).toEqual({ url: SIGNED });
    expect(JSON.stringify(body)).not.toContain(PATH);

    expect(logEvent).toHaveBeenCalledTimes(1);
    expect(logEvent).toHaveBeenCalledWith("proof_view", "result", RESULT);
    expect(storageFrom).toHaveBeenCalledWith("proofs");
    expect(createSignedUrl).toHaveBeenCalledTimes(1);
    expect(createSignedUrl).toHaveBeenCalledWith(PATH, 60);
    expect(logEvent.mock.invocationCallOrder[0]).toBeLessThan(
      createSignedUrl.mock.invocationCallOrder[0],
    );
  });

  it("500 and no URL when the proof view cannot be logged", async () => {
    logEvent.mockRejectedValue(new Error("audit log insert failed"));
    const res = await call(RESULT);
    expect(res.status).toBe(500);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body).not.toHaveProperty("url");
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("500 when signing fails, without leaking the path", async () => {
    createSignedUrl.mockResolvedValue({ data: null, error: { message: `Object not found ${PATH}` } });
    const res = await call(RESULT);
    expect(res.status).toBe(500);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(JSON.stringify(await res.json())).not.toContain(PATH);
  });

  it("500 when the results query errors; nothing logged", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: "boom" } });
    const res = await call(RESULT);
    expect(res.status).toBe(500);
    expect(logEvent).not.toHaveBeenCalled();
    expect(createSignedUrl).not.toHaveBeenCalled();
  });
});
