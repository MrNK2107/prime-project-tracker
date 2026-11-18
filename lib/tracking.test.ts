import { describe, it, expect } from "vitest";
import { stageOf, isOverdue, funnelOf, needsAttention, phaseOf, calendarDay } from "@/lib/tracking";

const NOW = new Date("2026-11-18T10:00:00Z");
const PAST = "2026-11-10T10:00:00Z";
const FUTURE = "2026-12-01T10:00:00Z";

describe("stageOf", () => {
  it("lets the result win over the invitation status", () => {
    expect(stageOf("joined", "sealed")).toBe("confirmed");
    expect(stageOf("joined", "claimed")).toBe("awaiting");
    expect(stageOf("joined", "sent_back")).toBe("sent_back");
  });
  it("falls back to the invitation status without a result", () => {
    expect(stageOf("invited", null)).toBe("no_reply");
    expect(stageOf("joined", null)).toBe("joined");
    expect(stageOf("declined", null)).toBe("declined");
  });
});

describe("isOverdue", () => {
  it("is false without a deadline or before it", () => {
    expect(isOverdue(null, "no_reply", NOW)).toBe(false);
    expect(isOverdue(FUTURE, "no_reply", NOW)).toBe(false);
  });
  it("flags students who still owe a reply or result after the deadline", () => {
    expect(isOverdue(PAST, "no_reply", NOW)).toBe(true);
    expect(isOverdue(PAST, "joined", NOW)).toBe(true);
    expect(isOverdue(PAST, "sent_back", NOW)).toBe(true);
  });
  it("does not flag anyone who is done or waiting on the reviewer", () => {
    for (const s of ["declined", "awaiting", "confirmed"] as const) expect(isOverdue(PAST, s, NOW)).toBe(false);
  });
});

describe("funnelOf", () => {
  it("counts each step, with later steps including earlier ones, and keeps awaiting apart from confirmed", () => {
    const rows = [
      { stage: "no_reply", overdue: true },
      { stage: "declined", overdue: false },
      { stage: "joined", overdue: false },
      { stage: "awaiting", overdue: false },
      { stage: "sent_back", overdue: false },
      { stage: "confirmed", overdue: false },
      { stage: "confirmed", overdue: false },
    ] as const;
    expect(funnelOf([...rows])).toEqual({ invited: 7, joined: 5, submitted: 4, confirmed: 2, declined: 1, noReply: 1, awaiting: 1, overdue: 1 });
  });
  it("is all zeros for an event nobody was invited to", () => {
    expect(funnelOf([]).invited).toBe(0);
  });
});

describe("needsAttention", () => {
  it("is true for results to review or overdue students only", () => {
    expect(needsAttention(funnelOf([{ stage: "awaiting", overdue: false }]))).toBe(true);
    expect(needsAttention(funnelOf([{ stage: "joined", overdue: true }]))).toBe(true);
    expect(needsAttention(funnelOf([{ stage: "joined", overdue: false }, { stage: "confirmed", overdue: false }]))).toBe(false);
  });
});

describe("phaseOf and calendarDay", () => {
  it("uses the start, else the deadline", () => {
    expect(phaseOf(FUTURE, PAST, NOW)).toBe("upcoming");
    expect(phaseOf(null, PAST, NOW)).toBe("past");
    expect(phaseOf(null, null, NOW)).toBe("upcoming");
  });
  it("places an event on its IST day", () => {
    expect(calendarDay("2026-11-20T20:00:00Z", null)).toBe("2026-11-21"); // 01:30 IST next day
    expect(calendarDay(null, null)).toBeNull();
  });
});
