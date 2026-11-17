/**
 * Proof file rules shared by the upload code and the database (spec Decision 8):
 * PDF, JPG or PNG, up to 5 MB, stored in the private bucket `proofs` under the student's
 * own folder. Keep in sync with supabase/migrations/0005_storage.sql (bucket settings,
 * insert policy) and public.is_own_proof_path in 0003_results.sql
 * (`^[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|jpg|png)$`, folder = student id).
 *
 * Upload with `upsert: false`: there are no select/update policies on storage.objects.
 */
export const PROOF_BUCKET = "proofs";
export const PROOF_MAX_BYTES = 5242880;
export const PROOF_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
export const PROOF_EXTENSIONS = ["pdf", "jpg", "png"] as const;

export type ProofExtension = (typeof PROOF_EXTENSIONS)[number];

/** Object name for a new proof file: `{studentId}/{random uuid}.{ext}`. */
export function buildProofPath(studentId: string, ext: ProofExtension): string {
  return `${studentId}/${crypto.randomUUID()}.${ext}`;
}
