/** Sign-in identifier: an email address (contains "@") or a student register number. */
export type Identifier = { kind: "email"; value: string } | { kind: "register"; value: string };

const REGISTER_RE = /^[A-Za-z0-9/-]{3,30}$/;

export function isRegisterNo(raw: string): boolean {
  return REGISTER_RE.test(raw.trim());
}

/** Normalised form stored and compared: trimmed, upper case. */
export function normalizeRegisterNo(raw: string): string {
  return raw.trim().toUpperCase();
}

export function parseIdentifier(raw: string): Identifier | null {
  const v = raw.trim();
  if (!v) return null;
  if (v.includes("@")) return { kind: "email", value: v.toLowerCase() };
  return isRegisterNo(v) ? { kind: "register", value: normalizeRegisterNo(v) } : null;
}

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 72;

export function passwordProblem(pw: string): string | null {
  if (pw.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters for the password.`;
  if (pw.length > MAX_PASSWORD_LENGTH) return `Use at most ${MAX_PASSWORD_LENGTH} characters for the password.`;
  return null;
}
