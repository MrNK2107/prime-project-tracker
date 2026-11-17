-- Task 6: proof storage (private bucket `proofs`, storage.objects policies) and the proof
-- path rule in submit_result / request_correction. Follows the fixture/helper pattern of
-- 30_results.sql and 40_audit.sql.
--
-- Size and MIME limits are enforced by the Storage API from the bucket row, so here they are
-- asserted from storage.buckets; tests/storage.integration.test.ts exercises them through the
-- real Storage API on the local stack.
begin;

create extension if not exists pgtap with schema extensions;

select plan(53);

-- ---------------------------------------------------------------- helpers
create schema tests;
grant usage on schema tests to authenticated, anon;

create function tests.as_user(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create function tests.as_anon() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end $$;

create function tests.make_user(uid uuid, r public.user_role, name text, is_active boolean default true)
returns void language plpgsql as $$
begin
  insert into auth.users (id, email, aud, role)
  values (uid, name || '@test.local', 'authenticated', 'authenticated');
  insert into public.profiles (id, email, full_name, role, active)
  values (uid, name || '@test.local', name, r, is_active);
end $$;

-- Insert one object row the way the Storage API does (as the caller).
create function tests.put(object_name text) returns void
language sql as $$
  insert into storage.objects (bucket_id, name, owner_id)
  values ('proofs', object_name, (select auth.uid())::text);
$$;

-- Names of all objects in `proofs` (read as owner, bypassing RLS).
create function tests.object_names() returns text[]
language sql security definer as $$
  select coalesce(array_agg(name order by name), '{}') from storage.objects where bucket_id = 'proofs';
$$;

create table tests.ids (name text primary key, id uuid);
grant select, insert on tests.ids to authenticated;

grant execute on all functions in schema tests to authenticated, anon;

-- ---------------------------------------------------------------- fixture ids
-- students     11111111-...-0001 S1   0002 S2   0009 SX (inactive)
-- faculty      22222222-...-0001 M1 mentor of S1   0006 C creator of every item
-- admin        33333333-...-0001, principal 44444444-...-0001
-- items        cccccccc-...-0001 I_proof   (requires confirmation + proof)
--                          0002 I_noproof (requires confirmation, no proof)
-- invitations  dddddddd-...-0001 inv1 I_proof   S1 joined
--                          0002 inv2 I_noproof S1 joined
--                          0003 inv3 I_proof   S2 joined

select tests.make_user('11111111-0000-0000-0000-000000000001', 'student', 's1');
select tests.make_user('11111111-0000-0000-0000-000000000002', 'student', 's2');
select tests.make_user('11111111-0000-0000-0000-000000000009', 'student', 'sx', false);
select tests.make_user('22222222-0000-0000-0000-000000000001', 'faculty', 'm1');
select tests.make_user('22222222-0000-0000-0000-000000000006', 'faculty', 'c');
select tests.make_user('33333333-0000-0000-0000-000000000001', 'admin', 'admin');
select tests.make_user('44444444-0000-0000-0000-000000000001', 'principal', 'principal');

insert into public.mentorships (mentor_id, student_id, valid_from) values
  ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', current_date - 100);

insert into public.items (id, type, title, requires_confirmation, requires_proof, created_by) values
  ('cccccccc-0000-0000-0000-000000000001', 'hackathon', 'I_proof', true, true, '22222222-0000-0000-0000-000000000006'),
  ('cccccccc-0000-0000-0000-000000000002', 'event', 'I_noproof', true, false, '22222222-0000-0000-0000-000000000006');
insert into public.invitations (id, item_id, student_id, status, responded_at) values
  ('dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'joined', now()),
  ('dddddddd-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'joined', now()),
  ('dddddddd-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002', 'joined', now());

-- ---------------------------------------------------------------- bucket
select is(
  (select row(b.name, b.public)::text from storage.buckets b where b.id = 'proofs'),
  row('proofs', false)::text,
  'bucket proofs exists and is private');
select is(
  (select file_size_limit from storage.buckets where id = 'proofs'),
  5242880::bigint, 'proofs: file_size_limit is 5242880 bytes (5 MB)');
select is(
  (select array(select unnest(allowed_mime_types) order by 1) from storage.buckets where id = 'proofs'),
  array['application/pdf', 'image/jpeg', 'image/png'],
  'proofs: allowed MIME types are exactly PDF, JPEG and PNG');

-- ---------------------------------------------------------------- policies
select ok(
  (select c.relrowsecurity from pg_class c
    where c.relnamespace = 'storage'::regnamespace and c.relname = 'objects'),
  'RLS is enabled on storage.objects');
select is(
  (select array_agg(policyname::text || ':' || cmd || ':' || array_to_string(roles, ',') order by policyname)
     from pg_policies where schemaname = 'storage' and tablename = 'objects'),
  array['proofs_insert_own_folder:INSERT:authenticated'],
  'storage.objects has one policy: INSERT for authenticated (no select/update/delete policy)');
select is(
  (select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'buckets'),
  0, 'storage.buckets has no policies (bucket rows are not readable through the API)');

-- ---------------------------------------------------------------- uploads (insert as caller)
select tests.as_user('11111111-0000-0000-0000-000000000001');  -- S1
select lives_ok(
  $$select tests.put('11111111-0000-0000-0000-000000000001/aaaaaaaa-1111-4111-8111-000000000001.pdf')$$,
  'student uploads a PDF into own folder');
select lives_ok(
  $$select tests.put('11111111-0000-0000-0000-000000000001/aaaaaaaa-1111-4111-8111-000000000002.jpg')$$,
  'student uploads a JPG into own folder');
select lives_ok(
  $$select tests.put('11111111-0000-0000-0000-000000000001/aaaaaaaa-1111-4111-8111-000000000003.png')$$,
  'student uploads a PNG into own folder');
select throws_ok(
  $$select tests.put('11111111-0000-0000-0000-000000000002/aaaaaaaa-1111-4111-8111-000000000004.pdf')$$,
  '42501', null, 'student cannot upload into another student''s folder');
select throws_ok(
  $$select tests.put('aaaaaaaa-1111-4111-8111-000000000005.pdf')$$,
  '42501', null, 'student cannot upload outside a folder');
select throws_ok(
  $$select tests.put('11111111-0000-0000-0000-000000000001/aaaaaaaa-1111-4111-8111-000000000006.exe')$$,
  '42501', null, 'student cannot upload an .exe name into own folder');
select throws_ok(
  $$select tests.put('11111111-0000-0000-0000-000000000001/11111111-0000-0000-0000-000000000002/aaaaaaaa-1111-4111-8111-000000000007.pdf')$$,
  '42501', null, 'student cannot upload into a nested folder');
select throws_ok(
  $$select tests.put('11111111-0000-0000-0000-000000000001/cert.pdf')$$,
  '42501', null, 'student cannot upload a file name that is not a uuid');
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('other', '11111111-0000-0000-0000-000000000001/aaaaaaaa-1111-4111-8111-000000000008.pdf')$$,
  '42501', null, 'student cannot upload into another bucket');
reset role;

select tests.as_user('11111111-0000-0000-0000-000000000009');  -- SX inactive
select throws_ok(
  $$select tests.put('11111111-0000-0000-0000-000000000009/aaaaaaaa-1111-4111-8111-000000000009.pdf')$$,
  '42501', null, 'inactive student cannot upload into own folder');
reset role;

select tests.as_user('33333333-0000-0000-0000-000000000001');  -- admin
select throws_ok(
  $$select tests.put('11111111-0000-0000-0000-000000000001/aaaaaaaa-1111-4111-8111-000000000010.pdf')$$,
  '42501', null, 'admin cannot upload into a student''s folder');
select throws_ok(
  $$select tests.put('33333333-0000-0000-0000-000000000001/aaaaaaaa-1111-4111-8111-000000000011.pdf')$$,
  '42501', null, 'admin cannot upload into own folder (proofs belong to students)');
reset role;

select tests.as_user('22222222-0000-0000-0000-000000000001');  -- M1
select throws_ok(
  $$select tests.put('11111111-0000-0000-0000-000000000001/aaaaaaaa-1111-4111-8111-000000000012.pdf')$$,
  '42501', null, 'mentor cannot upload into the mentee''s folder');
reset role;

select tests.as_user('44444444-0000-0000-0000-000000000001');  -- principal
select throws_ok(
  $$select tests.put('11111111-0000-0000-0000-000000000001/aaaaaaaa-1111-4111-8111-000000000013.pdf')$$,
  '42501', null, 'principal cannot upload into a student''s folder');
reset role;

select tests.as_anon();
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('proofs', '11111111-0000-0000-0000-000000000001/aaaaaaaa-1111-4111-8111-000000000014.pdf')$$,
  '42501', null, 'anon cannot upload');
reset role;

select is(tests.object_names(),
  array['11111111-0000-0000-0000-000000000001/aaaaaaaa-1111-4111-8111-000000000001.pdf',
        '11111111-0000-0000-0000-000000000001/aaaaaaaa-1111-4111-8111-000000000002.jpg',
        '11111111-0000-0000-0000-000000000001/aaaaaaaa-1111-4111-8111-000000000003.png'],
  'only the three own-folder uploads were stored');

-- ---------------------------------------------------------------- no direct read / update / delete
select tests.as_user('11111111-0000-0000-0000-000000000001');
select is((select count(*)::int from storage.objects), 0, 'student cannot read even own objects directly');
reset role;
select tests.as_user('22222222-0000-0000-0000-000000000001');
select is((select count(*)::int from storage.objects), 0, 'mentor cannot read objects directly');
reset role;
select tests.as_user('44444444-0000-0000-0000-000000000001');
select is((select count(*)::int from storage.objects), 0, 'principal cannot read objects directly');
reset role;
select tests.as_user('33333333-0000-0000-0000-000000000001');
select is((select count(*)::int from storage.objects), 0, 'admin cannot read objects');
reset role;
select tests.as_anon();
select is((select count(*)::int from storage.objects), 0, 'anon cannot read objects');
reset role;

-- The Storage API sets storage.allow_delete_query for deletes; do the same so RLS decides.
select set_config('storage.allow_delete_query', 'true', true);

select tests.as_user('11111111-0000-0000-0000-000000000001');
select lives_ok($$update storage.objects set name = name || '.x', metadata = '{"x":1}'$$,
  'student update statement runs');
select lives_ok($$delete from storage.objects$$, 'student delete statement runs');
reset role;
select tests.as_user('33333333-0000-0000-0000-000000000001');
select lives_ok($$update storage.objects set name = name || '.x'$$, 'admin update statement runs');
select lives_ok($$delete from storage.objects$$, 'admin delete statement runs');
reset role;
select tests.as_user('44444444-0000-0000-0000-000000000001');
select lives_ok($$delete from storage.objects$$, 'principal delete statement runs');
reset role;
select tests.as_anon();
select lives_ok($$update storage.objects set name = name || '.x'$$, 'anon update statement runs');
select lives_ok($$delete from storage.objects$$, 'anon delete statement runs');
reset role;

select set_config('storage.allow_delete_query', 'false', true);

select is(tests.object_names(),
  array['11111111-0000-0000-0000-000000000001/aaaaaaaa-1111-4111-8111-000000000001.pdf',
        '11111111-0000-0000-0000-000000000001/aaaaaaaa-1111-4111-8111-000000000002.jpg',
        '11111111-0000-0000-0000-000000000001/aaaaaaaa-1111-4111-8111-000000000003.png'],
  'no object was updated or deleted by student, admin, principal or anon');
select is(
  (select count(*)::int from storage.objects where bucket_id = 'proofs' and metadata is not null),
  0, 'no object metadata was changed');

-- ---------------------------------------------------------------- proof_path rule: submit_result
select tests.as_user('11111111-0000-0000-0000-000000000001');  -- S1
select throws_ok(
  $$select public.submit_result('dddddddd-0000-0000-0000-000000000001', 'Winner', null,
      '11111111-0000-0000-0000-000000000002/aaaaaaaa-1111-4111-8111-000000000020.pdf')$$,
  '22023', 'proof file must be in the student''s own folder', 'submit_result rejects a proof path in another student''s folder');
select throws_ok(
  $$select public.submit_result('dddddddd-0000-0000-0000-000000000001', 'Winner', null, '../x.pdf')$$,
  '22023', 'proof file must be in the student''s own folder', 'submit_result rejects ../x.pdf');
select throws_ok(
  $$select public.submit_result('dddddddd-0000-0000-0000-000000000001', 'Winner', null,
      '11111111-0000-0000-0000-000000000001/../11111111-0000-0000-0000-000000000002/aaaaaaaa-1111-4111-8111-000000000020.pdf')$$,
  '22023', 'proof file must be in the student''s own folder', 'submit_result rejects a traversal path starting with the own folder');
select throws_ok(
  $$select public.submit_result('dddddddd-0000-0000-0000-000000000001', 'Winner', null,
      '11111111-0000-0000-0000-000000000001/aaaaaaaa-1111-4111-8111-000000000020.exe')$$,
  '22023', 'proof file must be in the student''s own folder', 'submit_result rejects a wrong extension');
select throws_ok(
  $$select public.submit_result('dddddddd-0000-0000-0000-000000000001', 'Winner', null,
      '11111111-0000-0000-0000-000000000001/aaaaaaaa-1111-4111-8111-000000000020.PDF')$$,
  '22023', 'proof file must be in the student''s own folder', 'submit_result rejects an upper-case extension');
select throws_ok(
  $$select public.submit_result('dddddddd-0000-0000-0000-000000000001', 'Winner', null,
      'proofs/11111111-0000-0000-0000-000000000001/aaaaaaaa-1111-4111-8111-000000000020.pdf')$$,
  '22023', 'proof file must be in the student''s own folder', 'submit_result rejects a path with a bucket prefix');
select throws_ok(
  $$select public.submit_result('dddddddd-0000-0000-0000-000000000002', 'Attended', null,
      '11111111-0000-0000-0000-000000000002/aaaaaaaa-1111-4111-8111-000000000021.pdf')$$,
  '22023', 'proof file must be in the student''s own folder', 'submit_result rejects another student''s folder even when proof is optional');
select lives_ok(
  $$insert into tests.ids select 'r1', public.submit_result('dddddddd-0000-0000-0000-000000000001',
      'Winner', null, '11111111-0000-0000-0000-000000000001/aaaaaaaa-1111-4111-8111-000000000001.pdf')$$,
  'submit_result accepts a proof path in the own folder');
select is(
  (select proof_path from public.results where id = (select id from tests.ids where name = 'r1')),
  '11111111-0000-0000-0000-000000000001/aaaaaaaa-1111-4111-8111-000000000001.pdf',
  'the own-folder proof path is stored as given');
select lives_ok(
  $$select public.submit_result('dddddddd-0000-0000-0000-000000000002', 'Attended', null, null)$$,
  'submit_result still accepts no proof when the item does not require one');
reset role;

-- S2 cannot point at S1's file either (S2's own invitation)
select tests.as_user('11111111-0000-0000-0000-000000000002');
select throws_ok(
  $$select public.submit_result('dddddddd-0000-0000-0000-000000000003', 'Winner', null,
      '11111111-0000-0000-0000-000000000001/aaaaaaaa-1111-4111-8111-000000000001.pdf')$$,
  '22023', 'proof file must be in the student''s own folder', 'S2 cannot submit S1''s proof file as their own');
reset role;

-- ---------------------------------------------------------------- proof_path rule: request_correction
select tests.as_user('22222222-0000-0000-0000-000000000001');  -- M1 confirms r1
select lives_ok(
  $$select public.review_result((select id from tests.ids where name = 'r1'), 'confirm', null)$$,
  'mentor confirms the result');
reset role;

select tests.as_user('11111111-0000-0000-0000-000000000001');
select throws_ok(
  $$select public.request_correction((select id from tests.ids where name = 'r1'), 'Runner-up', null,
      '11111111-0000-0000-0000-000000000002/aaaaaaaa-1111-4111-8111-000000000030.pdf')$$,
  '22023', 'proof file must be in the student''s own folder', 'request_correction rejects a proof path in another student''s folder');
select throws_ok(
  $$select public.request_correction((select id from tests.ids where name = 'r1'), 'Runner-up', null,
      '../x.pdf')$$,
  '22023', 'proof file must be in the student''s own folder', 'request_correction rejects ../x.pdf');
select throws_ok(
  $$select public.request_correction((select id from tests.ids where name = 'r1'), 'Runner-up', null,
      '11111111-0000-0000-0000-000000000001/aaaaaaaa-1111-4111-8111-000000000030.gif')$$,
  '22023', 'proof file must be in the student''s own folder', 'request_correction rejects a wrong extension');
select lives_ok(
  $$insert into tests.ids select 'r2', public.request_correction((select id from tests.ids where name = 'r1'),
      'Runner-up', null, '11111111-0000-0000-0000-000000000001/aaaaaaaa-1111-4111-8111-000000000002.jpg')$$,
  'request_correction accepts a proof path in the own folder');
reset role;
select is(
  (select proof_path from public.results where id = (select id from tests.ids where name = 'r2')),
  '11111111-0000-0000-0000-000000000001/aaaaaaaa-1111-4111-8111-000000000002.jpg',
  'the correction stores the own-folder proof path');

select * from finish();
rollback;
