/**
 * Proof uploads through the real Storage API of the local Supabase stack (Task 6).
 * Skipped unless INTEGRATION_SUPABASE_URL, INTEGRATION_ANON_KEY and
 * INTEGRATION_SERVICE_ROLE_KEY are set, for example:
 *
 *   eval "$(npx supabase status -o env | sed -n 's/^\(API_URL\|ANON_KEY\|SERVICE_ROLE_KEY\)=/export INTEGRATION_\1=/p' \
 *     | sed 's/INTEGRATION_API_URL/INTEGRATION_SUPABASE_URL/')" && npx vitest run tests/storage.integration.test.ts
 *
 * supabase/tests/50_storage.sql covers the policies at the SQL level; this file checks
 * what only the Storage API enforces (bucket size and MIME limits) and that a plain
 * insert policy is enough for an upload.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildProofPath, PROOF_BUCKET, PROOF_MAX_BYTES } from "@/lib/proof";

const URL = process.env.INTEGRATION_SUPABASE_URL;
const ANON = process.env.INTEGRATION_ANON_KEY;
const SERVICE = process.env.INTEGRATION_SERVICE_ROLE_KEY;
const enabled = Boolean(URL && ANON && SERVICE);

const opts = { auth: { persistSession: false, autoRefreshToken: false } };

describe.skipIf(!enabled)("proofs bucket through the Storage API", () => {
  let service: SupabaseClient;
  let studentA: SupabaseClient;
  let anon: SupabaseClient;
  const ids: string[] = [];
  const uploaded: string[] = [];
  const password = `pw-${crypto.randomUUID()}`;

  async function makeStudent(): Promise<string> {
    const email = `proof-it-${crypto.randomUUID()}@test.local`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error ?? new Error("createUser failed");
    ids.push(data.user.id);
    const { error: pErr } = await service
      .from("profiles")
      .insert({ id: data.user.id, email, full_name: "proof it", role: "student", active: true });
    if (pErr) throw pErr;
    return email;
  }

  let a = "";
  let b = "";

  beforeAll(async () => {
    service = createClient(URL!, SERVICE!, opts);
    anon = createClient(URL!, ANON!, opts);
    const emailA = await makeStudent();
    await makeStudent();
    [a, b] = ids;
    studentA = createClient(URL!, ANON!, opts);
    const { error } = await studentA.auth.signInWithPassword({ email: emailA, password });
    if (error) throw error;
  });

  afterAll(async () => {
    if (!enabled) return;
    if (uploaded.length) await service.storage.from(PROOF_BUCKET).remove(uploaded);
    for (const id of ids) await service.auth.admin.deleteUser(id);
  });

  const pdf = (n: number) => new Blob([new Uint8Array(n)], { type: "application/pdf" });

  it("a student uploads a PDF into their own folder (insert policy alone is enough)", async () => {
    const path = buildProofPath(a, "pdf");
    const { error } = await studentA.storage.from(PROOF_BUCKET).upload(path, pdf(1024), {
      contentType: "application/pdf",
      upsert: false,
    });
    expect(error).toBeNull();
    uploaded.push(path);
  });

  it("a file of exactly 5 MB is accepted, one byte more is rejected", async () => {
    const ok = buildProofPath(a, "pdf");
    const r1 = await studentA.storage.from(PROOF_BUCKET).upload(ok, pdf(PROOF_MAX_BYTES), {
      contentType: "application/pdf",
    });
    expect(r1.error).toBeNull();
    uploaded.push(ok);

    const big = buildProofPath(a, "pdf");
    const r2 = await studentA.storage.from(PROOF_BUCKET).upload(big, pdf(PROOF_MAX_BYTES + 1), {
      contentType: "application/pdf",
    });
    expect(r2.error).not.toBeNull();
  });

  it("an .exe is rejected (by name and by MIME type)", async () => {
    const exeBlob = new Blob([new Uint8Array(64)], { type: "application/x-msdownload" });
    const byName = await studentA.storage
      .from(PROOF_BUCKET)
      .upload(`${a}/${crypto.randomUUID()}.exe`, exeBlob, { contentType: "application/x-msdownload" });
    expect(byName.error).not.toBeNull();

    const byMime = await studentA.storage
      .from(PROOF_BUCKET)
      .upload(buildProofPath(a, "pdf"), exeBlob, { contentType: "application/x-msdownload" });
    expect(byMime.error).not.toBeNull();
  });

  it("a student cannot upload into another student's folder", async () => {
    const { error } = await studentA.storage
      .from(PROOF_BUCKET)
      .upload(buildProofPath(b, "pdf"), pdf(10), { contentType: "application/pdf" });
    expect(error).not.toBeNull();
  });

  it("nobody reads, overwrites or deletes objects directly; a service-signed URL works", async () => {
    const path = uploaded[0];

    expect((await studentA.storage.from(PROOF_BUCKET).download(path)).error).not.toBeNull();
    expect((await anon.storage.from(PROOF_BUCKET).download(path)).error).not.toBeNull();
    expect((await studentA.storage.from(PROOF_BUCKET).createSignedUrl(path, 60)).error).not.toBeNull();
    expect((await studentA.storage.from(PROOF_BUCKET).list(a)).data ?? []).toHaveLength(0);

    const overwrite = await studentA.storage
      .from(PROOF_BUCKET)
      .upload(path, pdf(10), { contentType: "application/pdf", upsert: true });
    expect(overwrite.error).not.toBeNull();

    await studentA.storage.from(PROOF_BUCKET).remove([path]);
    const signed = await service.storage.from(PROOF_BUCKET).createSignedUrl(path, 60);
    expect(signed.error).toBeNull();
    const res = await fetch(signed.data!.signedUrl);
    expect(res.status).toBe(200);
    expect((await res.arrayBuffer()).byteLength).toBe(1024);
  });
});
