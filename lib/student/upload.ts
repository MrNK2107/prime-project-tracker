import { buildProofPath, PROOF_BUCKET, PROOF_MAX_BYTES, type ProofExtension } from "@/lib/proof";

const EXT_BY_MIME: Record<string, ProofExtension> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

/** Checks type and size before anything is uploaded. Returns the stored extension, or throws a message fit to show. */
export function validateProofFile(file: { name: string; type: string; size: number }): ProofExtension {
  const ext = EXT_BY_MIME[file.type];
  if (!ext) throw new Error("Proof must be a PDF, JPG or PNG file.");
  if (file.size <= 0) throw new Error("That file is empty.");
  if (file.size > PROOF_MAX_BYTES) throw new Error("Proof must be 5 MB or smaller.");
  return ext;
}

type UploadClient = {
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
  storage: { from: (bucket: string) => { upload: (path: string, file: File, opts: { upsert: boolean; contentType: string }) => Promise<{ error: { message: string } | null }> } };
};

/**
 * Uploads one proof file into the student's own folder of the private bucket and returns its storage path.
 * Rejects before touching storage when the type or size is wrong. Never overwrites (a new file gets a new name).
 */
export async function uploadProof(file: File, client: UploadClient): Promise<string> {
  const ext = validateProofFile(file);
  const { data } = await client.auth.getUser();
  if (!data.user) throw new Error("Sign in again to upload a file.");
  const path = buildProofPath(data.user.id, ext);
  const { error } = await client.storage.from(PROOF_BUCKET).upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw new Error("The file could not be uploaded. Check your connection and try again.");
  return path;
}
