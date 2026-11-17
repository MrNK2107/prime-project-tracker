import { describe, it, expect } from "vitest";
import {
  buildProofPath,
  PROOF_EXTENSIONS,
  PROOF_MAX_BYTES,
  PROOF_MIME_TYPES,
} from "@/lib/proof";

// Same pattern as submit_result / request_correction and the storage insert policy
// (supabase/migrations/0003_results.sql, 0005_storage.sql).
const SQL_PROOF_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|jpg|png)$/;

const STUDENT = "11111111-0000-0000-0000-000000000001";

describe("proof constants", () => {
  it("match the bucket settings in 0005_storage.sql", () => {
    expect(PROOF_MAX_BYTES).toBe(5242880);
    expect([...PROOF_MIME_TYPES]).toEqual(["application/pdf", "image/jpeg", "image/png"]);
    expect([...PROOF_EXTENSIONS]).toEqual(["pdf", "jpg", "png"]);
  });
});

describe("buildProofPath", () => {
  it.each(["pdf", "jpg", "png"] as const)("builds a %s path the SQL regex accepts", (ext) => {
    const path = buildProofPath(STUDENT, ext);
    expect(path).toMatch(SQL_PROOF_PATH);
    expect(path.startsWith(`${STUDENT}/`)).toBe(true);
    expect(path.endsWith(`.${ext}`)).toBe(true);
  });

  it("uses a fresh random file name each time", () => {
    expect(buildProofPath(STUDENT, "pdf")).not.toBe(buildProofPath(STUDENT, "pdf"));
  });
});
