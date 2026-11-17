-- Task 6: proof storage.
--
-- Rules (spec Decision 8 and "Builder's calls": proof files are PDF, JPG or PNG, up to 5 MB,
-- readable by anyone who can see that student's result):
--   * one private bucket `proofs`; the Storage API enforces the size limit and MIME list
--     from this bucket row (5242880 bytes; application/pdf, image/jpeg, image/png);
--   * object names are {student_id}/{uuid}.{pdf|jpg|png} (lib/proof.ts buildProofPath),
--     the same rule submit_result / request_correction apply to results.proof_path;
--   * an active student may upload (INSERT) only into their own folder;
--   * nobody (anon, authenticated, any role) may select, update or delete objects directly.
--     Proof files are read only through GET /api/proof/[resultId], which checks the
--     results row with the user's own client (RLS on results), logs proof_view, and then
--     creates a 60-second signed URL with the service client. Admin cannot read results,
--     so admin never gets a URL; the principal reads results and gets read-only URLs.
--   * uploads must not use upsert (that needs select/update policies, which do not exist);
--     a new file always gets a new uuid name.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proofs', 'proofs', false, 5242880,
        array['application/pdf', 'image/jpeg', 'image/png']);

-- The storage INSERT policy runs as the uploading user, so it needs the (pure) path check.
grant execute on function public.is_own_proof_path(uuid, text) to authenticated;

-- RLS is already enabled on storage.objects by the storage service; no other bucket exists.
create policy proofs_insert_own_folder on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'proofs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.is_own_proof_path((select auth.uid()), name)
    and (select public.current_role_of()) = 'student'   -- null for inactive users
  );

-- No select, update or delete policies on storage.objects, and none on storage.buckets.
