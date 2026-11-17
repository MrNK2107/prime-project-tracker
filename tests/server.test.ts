import { describe, it, expect, afterEach } from "vitest";
import { createServiceClient } from "@/lib/supabase/server";

describe("createServiceClient", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("throws when the service role key is missing", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => createServiceClient()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("returns a client when configured", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    expect(typeof createServiceClient().from).toBe("function");
  });
});
