import { describe, expect, it } from "vitest";
import { parseIdentifier, passwordProblem } from "./identifier";

describe("parseIdentifier", () => {
  it("treats anything with @ as an email, lower-cased", () => {
    expect(parseIdentifier("  Asha@College.edu ")).toEqual({ kind: "email", value: "asha@college.edu" });
  });
  it("treats a plain code as a register number, upper-cased", () => {
    expect(parseIdentifier("192110045")).toEqual({ kind: "register", value: "192110045" });
    expect(parseIdentifier("sec/21/cse-045")).toEqual({ kind: "register", value: "SEC/21/CSE-045" });
  });
  it("rejects empty or odd input", () => {
    expect(parseIdentifier("")).toBeNull();
    expect(parseIdentifier("ab")).toBeNull();
    expect(parseIdentifier("a b c")).toBeNull();
    expect(parseIdentifier("x'; drop")).toBeNull();
  });
});

describe("passwordProblem", () => {
  it("requires 8 to 72 characters", () => {
    expect(passwordProblem("short")).not.toBeNull();
    expect(passwordProblem("longenough")).toBeNull();
    expect(passwordProblem("x".repeat(73))).not.toBeNull();
  });
});
