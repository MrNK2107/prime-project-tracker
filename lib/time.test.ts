import { describe, it, expect } from "vitest";
import { istInputToIso, formatWhen } from "@/lib/time";
import { safeHttpsUrl } from "@/lib/url";

describe("istInputToIso", () => {
  it("adds the India offset", () => expect(istInputToIso("2026-11-20T10:30")).toBe("2026-11-20T10:30:00+05:30"));
  it("is null when blank", () => expect(istInputToIso("  ")).toBeNull());
  it("rejects malformed or impossible values", () => {
    expect(() => istInputToIso("20/11/2026")).toThrow();
    expect(() => istInputToIso("2026-13-40T10:30")).toThrow();
  });
  it("shows the same wall-clock time in IST", () => {
    expect(formatWhen("2026-11-20T10:30:00+05:30")).toMatch(/10:30/);
  });
});

describe("safeHttpsUrl", () => {
  it("accepts https links", () => expect(safeHttpsUrl("https://meet.google.com/abc-defg-hij")).toBe("https://meet.google.com/abc-defg-hij"));
  it.each(["javascript:alert(1)", "http://meet.google.com/x", "data:text/html,<b>", "meet.google.com/x", "https://", "", null, undefined])(
    "rejects %s",
    (v) => expect(safeHttpsUrl(v as string)).toBeNull(),
  );
});
