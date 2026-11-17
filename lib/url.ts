/** Returns the normalised address when it is a well-formed https link, otherwise null (rejects javascript:, data:, http: ...). */
export function safeHttpsUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  try {
    const u = new URL(input.trim());
    return u.protocol === "https:" && u.hostname ? u.toString() : null;
  } catch {
    return null;
  }
}
