-- Task 4: results, confirmation and revisions (submit_result / review_result /
-- request_correction, lock trigger, RLS). Follows the fixture/helper pattern of
-- 10_visibility.sql and 20_items.sql.
begin;

create extension if not exists pgtap with schema extensions;

select plan(76);

-- ---------------------------------------------------------------- helpers
create schema tests;
grant usage on schema tests to authenticated;

create function tests.as_user(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create function tests.make_user(uid uuid, r public.user_role, name text, is_active boolean default true)
returns void language plpgsql as $$
begin
  insert into auth.users (id, email, aud, role)
  values (uid, name || '@test.local', 'authenticated', 'authenticated');
  insert into public.profiles (id, email, full_name, role, active)
  values (uid, name || '@test.local', name, r, is_active);
end $$;

-- Named ids captured during the test (result ids returned by the functions).
create table tests.ids (name text primary key, id uuid);
grant select, insert on tests.ids to authenticated;

-- (revision, status) of every result of an invitation, in revision order (read as owner).
create function tests.revs(inv uuid) returns text[]
language sql as $$
  select array_agg(r.revision || ':' || r.status order by r.revision)
  from public.results r where r.invitation_id = inv;
$$;

-- Distinct invitation ids of the results the current caller can read.
create function tests.readable() returns uuid[]
language sql as $$
  select coalesce(array_agg(distinct r.invitation_id order by r.invitation_id), '{}')
  from public.results r;
$$;

grant execute on all functions in schema tests to authenticated;

-- ---------------------------------------------------------------- fixture ids
-- students     11111111-...-0001 S1 (D1, group G)   0002 S2 (D1, group G)   0003 S3 (D2)
-- faculty      22222222-...-0001 M1 mentor of S1
--                          0002 MO old mentor of S2 (link ended during the test)
--                          0003 MN new mentor of S2 (link starts during the test)
--                          0004 H1 HOD of D1 (S1, S2)
--                          0005 GL lead of group G (S1, S2), not a mentor
--                          0006 C  creator of every item, no links
-- admin        33333333-...-0001, principal 44444444-...-0001
-- items        cccccccc-...-0001 I_conf  (requires confirmation + proof)
--                          0002 I_auto  (no confirmation, no proof)
--                          0003 I_conf2 (requires confirmation, no proof)
-- invitations  dddddddd-...-0001 inv1 I_conf  S1 joined
--                          0002 inv2 I_auto  S1 joined
--                          0003 inv3 I_conf2 S2 joined
--                          0004 inv4 I_conf2 S1 invited
--                          0006 inv6 I_auto  S3 joined

select tests.make_user('11111111-0000-0000-0000-000000000001', 'student', 's1');
select tests.make_user('11111111-0000-0000-0000-000000000002', 'student', 's2');
select tests.make_user('11111111-0000-0000-0000-000000000003', 'student', 's3');
select tests.make_user('22222222-0000-0000-0000-000000000001', 'faculty', 'm1');
select tests.make_user('22222222-0000-0000-0000-000000000002', 'faculty', 'mo');
select tests.make_user('22222222-0000-0000-0000-000000000003', 'faculty', 'mn');
select tests.make_user('22222222-0000-0000-0000-000000000004', 'faculty', 'h1');
select tests.make_user('22222222-0000-0000-0000-000000000005', 'faculty', 'gl');
select tests.make_user('22222222-0000-0000-0000-000000000006', 'faculty', 'c');
select tests.make_user('33333333-0000-0000-0000-000000000001', 'admin', 'admin');
select tests.make_user('44444444-0000-0000-0000-000000000001', 'principal', 'principal');

insert into public.departments (id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'D1'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'D2');
insert into public.groups (id, name) values ('bbbbbbbb-0000-0000-0000-000000000001', 'G');

insert into public.department_memberships (student_id, department_id, valid_from) values
  ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', current_date - 100),
  ('11111111-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', current_date - 100),
  ('11111111-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000002', current_date - 100);
insert into public.hod_assignments (faculty_id, department_id, valid_from) values
  ('22222222-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', current_date - 100);
insert into public.mentorships (mentor_id, student_id, valid_from) values
  ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', current_date - 100),
  ('22222222-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000002', current_date - 100);
insert into public.group_leads (group_id, faculty_id, valid_from) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000005', current_date - 100);
insert into public.group_members (group_id, student_id, valid_from) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', current_date - 100),
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002', current_date - 100);

insert into public.items (id, type, title, requires_confirmation, requires_proof, created_by) values
  ('cccccccc-0000-0000-0000-000000000001', 'hackathon', 'I_conf', true, true, '22222222-0000-0000-0000-000000000006'),
  ('cccccccc-0000-0000-0000-000000000002', 'event', 'I_auto', false, false, '22222222-0000-0000-0000-000000000006'),
  ('cccccccc-0000-0000-0000-000000000003', 'internship', 'I_conf2', true, false, '22222222-0000-0000-0000-000000000006');
insert into public.invitations (id, item_id, student_id, status, responded_at) values
  ('dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'joined', now()),
  ('dddddddd-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'joined', now()),
  ('dddddddd-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000002', 'joined', now()),
  ('dddddddd-0000-0000-0000-000000000004', 'cccccccc-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001', 'invited', null),
  ('dddddddd-0000-0000-0000-000000000006', 'cccccccc-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000003', 'joined', now());

-- ---------------------------------------------------------------- structure
select ok(
  (select c.relrowsecurity from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relname = 'results'),
  'RLS is enabled on results');

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'results' and cmd <> 'SELECT'),
  0, 'results has no insert/update/delete policies');

select ok(
  not bool_or(has_table_privilege(r, 'public.results', p)),
  'authenticated and anon have no INSERT/UPDATE/DELETE/TRUNCATE on results')
from unnest(array['authenticated', 'anon']) r,
     unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) p;

select ok(
  not has_table_privilege('anon', 'public.results', 'SELECT')
  and has_table_privilege('authenticated', 'public.results', 'SELECT'),
  'results: SELECT for authenticated only, nothing for anon');

select ok(
  bool_and(not has_function_privilege('anon', f, 'EXECUTE')
           and not has_function_privilege('service_role', f, 'EXECUTE')
           and not has_function_privilege('public', f, 'EXECUTE')
           and has_function_privilege('authenticated', f, 'EXECUTE')),
  'submit_result / review_result / request_correction: executable by authenticated only')
from unnest(array['public.submit_result(uuid, text, text, text)',
                  'public.review_result(uuid, text, text)',
                  'public.request_correction(uuid, text, text, text)']) f;

select is(
  (select array_agg(e.enumlabel order by e.enumsortorder) from pg_enum e
    where e.enumtypid = 'public.result_status'::regtype),
  array['submitted', 'sent_back', 'confirmed', 'superseded']::name[], 'result_status values');

select ok(
  exists (select 1 from pg_index x
          where x.indrelid = 'public.results'::regclass and x.indisunique
            and x.indkey::text = (select string_agg(a.attnum::text, ' ' order by k.ord)
                                  from unnest(array['invitation_id', 'revision']) with ordinality k(col, ord)
                                  join pg_attribute a on a.attrelid = 'public.results'::regclass
                                                     and a.attname = k.col)),
  'unique index on results (invitation_id, revision)');

-- ---------------------------------------------------------------- submit_result: rejections
select tests.as_user('11111111-0000-0000-0000-000000000001');  -- S1
select throws_ok(
  $$select public.submit_result('dddddddd-0000-0000-0000-000000000004', 'won', null, null)$$,
  '22023', null, 'submit_result fails when the invitation is not joined');
select throws_ok(
  $$select public.submit_result('dddddddd-0000-0000-0000-000000000001', 'won', 'd', null)$$,
  '22023', null, 'submit without required proof fails (null proof)');
select throws_ok(
  $$select public.submit_result('dddddddd-0000-0000-0000-000000000001', 'won', 'd', '   ')$$,
  '22023', null, 'submit without required proof fails (blank proof)');
select throws_ok(
  $$select public.submit_result('dddddddd-0000-0000-0000-000000000001', '  ', 'd', 'proofs/s1/cert.pdf')$$,
  '22023', null, 'submit with an empty outcome fails');
select throws_ok(
  $$insert into public.results (invitation_id, revision, outcome, status)
    values ('dddddddd-0000-0000-0000-000000000001', 1, 'won', 'confirmed')$$,
  '42501', null, 'student cannot insert a result directly');
reset role;

select tests.as_user('11111111-0000-0000-0000-000000000002');  -- S2
select throws_ok(
  $$select public.submit_result('dddddddd-0000-0000-0000-000000000001', 'won', 'd', 'proofs/s2/x.pdf')$$,
  '42501', null, 'submit_result by another student fails');
reset role;

-- ---------------------------------------------------------------- submit_result: first submission
select tests.as_user('11111111-0000-0000-0000-000000000001');
select lives_ok(
  $$insert into tests.ids select 'inv1_r1', public.submit_result(
      'dddddddd-0000-0000-0000-000000000001', 'Winner', 'First place, 120 teams', 'proofs/s1/cert.pdf')$$,
  'joined student submits a result with the required proof');
select is(
  (select row(revision, status, confirmed_by, confirmed_at, proof_path, outcome)::text from public.results
    where id = (select id from tests.ids where name = 'inv1_r1')),
  row(1, 'submitted'::public.result_status, null::uuid, null::timestamptz,
      'proofs/s1/cert.pdf', 'Winner')::text,
  'result stored as revision 1, submitted, unconfirmed');
select throws_ok(
  $$select public.submit_result('dddddddd-0000-0000-0000-000000000001', 'Winner', null, 'proofs/s1/cert.pdf')$$,
  '22023', null, 'second submit while a result is awaiting review fails');
reset role;

-- ---------------------------------------------------------------- review_result: who cannot confirm
select tests.as_user('22222222-0000-0000-0000-000000000004');  -- H1, HOD of S1
select throws_ok(
  $$select public.review_result((select id from tests.ids where name = 'inv1_r1'), 'confirm', null)$$,
  '42501', null, 'HOD cannot confirm');
reset role;
select tests.as_user('22222222-0000-0000-0000-000000000005');  -- GL, lead of S1's group
select throws_ok(
  $$select public.review_result((select id from tests.ids where name = 'inv1_r1'), 'confirm', null)$$,
  '42501', null, 'group lead (not mentor, not creator) cannot confirm');
reset role;
select tests.as_user('44444444-0000-0000-0000-000000000001');
select throws_ok(
  $$select public.review_result((select id from tests.ids where name = 'inv1_r1'), 'confirm', null)$$,
  '42501', null, 'principal cannot confirm');
reset role;
select tests.as_user('33333333-0000-0000-0000-000000000001');
select throws_ok(
  $$select public.review_result((select id from tests.ids where name = 'inv1_r1'), 'confirm', null)$$,
  '42501', null, 'admin cannot confirm');
reset role;
select tests.as_user('11111111-0000-0000-0000-000000000001');
select throws_ok(
  $$select public.review_result((select id from tests.ids where name = 'inv1_r1'), 'confirm', null)$$,
  '42501', null, 'the student cannot confirm their own result');
reset role;

-- ---------------------------------------------------------------- send back, resubmit
select tests.as_user('22222222-0000-0000-0000-000000000001');  -- M1, mentor of S1
select throws_ok(
  $$select public.review_result((select id from tests.ids where name = 'inv1_r1'), 'approve', 'x')$$,
  '22023', null, 'decision must be confirm or send_back');
select throws_ok(
  $$select public.review_result((select id from tests.ids where name = 'inv1_r1'), 'send_back', null)$$,
  '22023', null, 'send back requires a note (null)');
select throws_ok(
  $$select public.review_result((select id from tests.ids where name = 'inv1_r1'), 'send_back', '   ')$$,
  '22023', null, 'send back requires a note (blank)');
select lives_ok(
  $$select public.review_result((select id from tests.ids where name = 'inv1_r1'), 'send_back',
      'Please upload the certificate page with your name')$$,
  'current mentor sends the result back with a note');
reset role;

select tests.as_user('11111111-0000-0000-0000-000000000001');
select is(
  (select row(status, review_note)::text from public.results
    where id = (select id from tests.ids where name = 'inv1_r1')),
  row('sent_back'::public.result_status, 'Please upload the certificate page with your name')::text,
  'sent back result returns to the student with the note');
select lives_ok(
  $$insert into tests.ids select 'inv1_r2', public.submit_result(
      'dddddddd-0000-0000-0000-000000000001', 'Winner', 'First place', 'proofs/s1/cert-named.pdf')$$,
  'student resubmits after send back');
reset role;
select is(tests.revs('dddddddd-0000-0000-0000-000000000001'),
  array['1:sent_back', '2:submitted'],
  'resubmission adds revision 2; revision 1 stays sent_back');

-- ---------------------------------------------------------------- creator confirms
select tests.as_user('22222222-0000-0000-0000-000000000006');  -- C, creator, no links
select lives_ok(
  $$select public.review_result((select id from tests.ids where name = 'inv1_r2'), 'confirm', null)$$,
  'item creator confirms');
select is(
  (select row(status, confirmed_by, confirmed_at is not null)::text from public.results
    where id = (select id from tests.ids where name = 'inv1_r2')),
  row('confirmed'::public.result_status, '22222222-0000-0000-0000-000000000006'::uuid, true)::text,
  'confirmed with confirmed_by = creator and confirmed_at set');
select throws_ok(
  $$update public.results set outcome = 'Runner-up'
    where id = (select id from tests.ids where name = 'inv1_r2')$$,
  '42501', null, 'direct update of a confirmed row fails even for the confirmer');
select throws_ok(
  $$delete from public.results where id = (select id from tests.ids where name = 'inv1_r2')$$,
  '42501', null, 'direct delete of a result fails for the confirmer');
select throws_ok(
  $$select public.review_result((select id from tests.ids where name = 'inv1_r2'), 'confirm', null)$$,
  '22023', null, 'a confirmed result cannot be reviewed again');
reset role;

select tests.as_user('22222222-0000-0000-0000-000000000001');  -- M1
select throws_ok(
  $$update public.results set status = 'superseded'
    where id = (select id from tests.ids where name = 'inv1_r2')$$,
  '42501', null, 'mentor cannot update results directly');
reset role;
select tests.as_user('44444444-0000-0000-0000-000000000001');  -- principal
select throws_ok(
  $$delete from public.results$$, '42501', null, 'principal cannot delete results');
reset role;

-- ---------------------------------------------------------------- lock trigger (table owner)
select throws_ok(
  $$update public.results set outcome = 'Runner-up'
    where id = (select id from tests.ids where name = 'inv1_r2')$$,
  '42501', 'confirmed results are locked',
  'owner update of a confirmed row is rejected by the trigger');
select throws_ok(
  $$update public.results set status = 'superseded'
    where id = (select id from tests.ids where name = 'inv1_r2')$$,
  '42501', 'confirmed results are locked',
  'owner confirmed -> superseded outside review_result is rejected');
select set_config('app.allow_supersede', 'on', true);
select throws_ok(
  $$update public.results set status = 'superseded', outcome = 'Runner-up'
    where id = (select id from tests.ids where name = 'inv1_r2')$$,
  '42501', 'confirmed results are locked',
  'supersede that also changes another column is rejected even with the setting on');
select set_config('app.allow_supersede', 'off', true);
select throws_ok(
  $$delete from public.results where id = (select id from tests.ids where name = 'inv1_r1')$$,
  '42501', 'results are never deleted', 'owner delete of a result is rejected by the trigger');

-- ---------------------------------------------------------------- item 6: no un-join after a result
select tests.as_user('11111111-0000-0000-0000-000000000001');
select throws_ok(
  $$select public.respond_to_invitation('dddddddd-0000-0000-0000-000000000001', 'declined')$$,
  '22023', null, 'student cannot flip join -> decline after submitting a result');
reset role;
select is((select status from public.invitations where id = 'dddddddd-0000-0000-0000-000000000001'),
  'joined'::public.invitation_status, 'invitation stays joined');

-- ---------------------------------------------------------------- correction of a confirmed result
select tests.as_user('11111111-0000-0000-0000-000000000001');
select throws_ok(
  $$select public.request_correction((select id from tests.ids where name = 'inv1_r2'),
      'Runner-up', 'Second place', null)$$,
  '22023', null, 'correction on an item requiring proof needs proof');
select throws_ok(
  $$select public.request_correction((select id from tests.ids where name = 'inv1_r1'),
      'Runner-up', 'Second place', 'proofs/s1/c.pdf')$$,
  '22023', null, 'correction of a non-confirmed (sent back) row fails');
select lives_ok(
  $$insert into tests.ids select 'inv1_r3', public.request_correction(
      (select id from tests.ids where name = 'inv1_r2'), 'Runner-up', 'Second place', 'proofs/s1/c.pdf')$$,
  'student requests a correction of the confirmed result');
select throws_ok(
  $$select public.request_correction((select id from tests.ids where name = 'inv1_r2'),
      'Third', 'x', 'proofs/s1/d.pdf')$$,
  '22023', null, 'second correction while one is pending fails');
select throws_ok(
  $$select public.submit_result('dddddddd-0000-0000-0000-000000000001', 'Third', null, 'proofs/s1/d.pdf')$$,
  '22023', null, 'submit_result while a correction is pending fails');
reset role;
select is(tests.revs('dddddddd-0000-0000-0000-000000000001'),
  array['1:sent_back', '2:confirmed', '3:submitted'],
  'correction is revision 3; old value stays confirmed until the correction is confirmed');

select tests.as_user('11111111-0000-0000-0000-000000000002');  -- S2
select throws_ok(
  $$select public.request_correction((select id from tests.ids where name = 'inv1_r2'),
      'x', 'x', 'proofs/s2/x.pdf')$$,
  '42501', null, 'another student cannot request a correction');
reset role;

select tests.as_user('22222222-0000-0000-0000-000000000001');  -- M1
select lives_ok(
  $$select public.review_result((select id from tests.ids where name = 'inv1_r3'), 'confirm', 'ok')$$,
  'current mentor confirms the correction');
reset role;
select is(tests.revs('dddddddd-0000-0000-0000-000000000001'),
  array['1:sent_back', '2:superseded', '3:confirmed'],
  'after the correction is confirmed the old row becomes superseded');
select is(
  (select array_agg(row(revision, confirmed_by, review_note)::text order by revision) from public.results
    where invitation_id = 'dddddddd-0000-0000-0000-000000000001' and revision > 1),
  array[row(2, '22222222-0000-0000-0000-000000000006'::uuid, null::text)::text,
        row(3, '22222222-0000-0000-0000-000000000001'::uuid, 'ok')::text],
  'superseded row keeps its confirmer; correction records the mentor as confirmer');

-- ---------------------------------------------------------------- item without confirmation
select tests.as_user('11111111-0000-0000-0000-000000000001');
select lives_ok(
  $$insert into tests.ids select 'inv2_r1', public.submit_result(
      'dddddddd-0000-0000-0000-000000000002', 'Attended', null, null)$$,
  'submit on an item without confirmation (no proof required)');
select is(
  (select row(status, confirmed_by, confirmed_at is not null)::text from public.results
    where id = (select id from tests.ids where name = 'inv2_r1')),
  row('confirmed'::public.result_status, null::uuid, true)::text,
  'item without confirmation auto-confirms with confirmed_by null');
reset role;

select tests.as_user('22222222-0000-0000-0000-000000000001');
select throws_ok(
  $$select public.review_result((select id from tests.ids where name = 'inv2_r1'), 'confirm', null)$$,
  '22023', null, 'an auto-confirmed result cannot be reviewed');
reset role;

select tests.as_user('11111111-0000-0000-0000-000000000001');
select lives_ok(
  $$insert into tests.ids select 'inv2_r2', public.request_correction(
      (select id from tests.ids where name = 'inv2_r1'), 'Attended and presented', null, null)$$,
  'student requests a correction of an auto-confirmed result');
reset role;
select is(tests.revs('dddddddd-0000-0000-0000-000000000002'),
  array['1:confirmed', '2:submitted'],
  'correction of an auto-confirmed result is submitted for review, not auto-confirmed');

select tests.as_user('22222222-0000-0000-0000-000000000006');  -- C
select lives_ok(
  $$select public.review_result((select id from tests.ids where name = 'inv2_r2'), 'send_back', 'Add the slides link')$$,
  'creator sends the correction back');
reset role;
select tests.as_user('11111111-0000-0000-0000-000000000001');
select lives_ok(
  $$insert into tests.ids select 'inv2_r3', public.submit_result(
      'dddddddd-0000-0000-0000-000000000002', 'Attended and presented', 'slides: https://x', null)$$,
  'student resubmits the sent-back correction');
reset role;
select is(tests.revs('dddddddd-0000-0000-0000-000000000002'),
  array['1:confirmed', '2:sent_back', '3:submitted'],
  'resubmitted correction stays submitted (old value still counts) even on an auto-confirm item');
select tests.as_user('22222222-0000-0000-0000-000000000006');
select lives_ok(
  $$select public.review_result((select id from tests.ids where name = 'inv2_r3'), 'confirm', null)$$,
  'creator confirms the resubmitted correction');
reset role;
select is(tests.revs('dddddddd-0000-0000-0000-000000000002'),
  array['1:superseded', '2:sent_back', '3:confirmed'],
  'old auto-confirmed value is superseded once the correction is confirmed');

-- ---------------------------------------------------------------- mentor change
select tests.as_user('11111111-0000-0000-0000-000000000002');  -- S2
select lives_ok(
  $$insert into tests.ids select 'inv3_r1', public.submit_result(
      'dddddddd-0000-0000-0000-000000000003', 'Offer received', null, null)$$,
  'S2 submits a result');
reset role;

-- MO's link ends yesterday (inclusive valid_to), MN's starts today.
update public.mentorships set valid_to = current_date - 1
  where mentor_id = '22222222-0000-0000-0000-000000000002';
insert into public.mentorships (mentor_id, student_id, valid_from) values
  ('22222222-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000002', current_date);

select tests.as_user('22222222-0000-0000-0000-000000000002');  -- MO
select throws_ok(
  $$select public.review_result((select id from tests.ids where name = 'inv3_r1'), 'confirm', null)$$,
  '42501', null, 'old mentor (link ended) cannot confirm');
select is(tests.readable(), '{}'::uuid[], 'old mentor reads no results of the former mentee');
reset role;
select tests.as_user('22222222-0000-0000-0000-000000000003');  -- MN
select lives_ok(
  $$select public.review_result((select id from tests.ids where name = 'inv3_r1'), 'confirm', null)$$,
  'new mentor confirms');
reset role;
select is(
  (select row(status, confirmed_by)::text from public.results
    where id = (select id from tests.ids where name = 'inv3_r1')),
  row('confirmed'::public.result_status, '22222222-0000-0000-0000-000000000003'::uuid)::text,
  'confirmed_by records the new mentor');

select tests.as_user('11111111-0000-0000-0000-000000000003');  -- S3
select lives_ok(
  $$select public.submit_result('dddddddd-0000-0000-0000-000000000006', 'Attended', null, null)$$,
  'S3 submits a result');
reset role;

-- ---------------------------------------------------------------- read visibility
select tests.as_user('33333333-0000-0000-0000-000000000001');
select is((select count(*)::int from public.results), 0, 'admin reads 0 results');
reset role;
select tests.as_user('44444444-0000-0000-0000-000000000001');
select is((select count(*)::int from public.results), 8, 'principal reads all 8 results');
reset role;
select tests.as_user('22222222-0000-0000-0000-000000000001');  -- M1
select is(tests.readable(),
  array['dddddddd-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002']::uuid[],
  'mentor reads mentee S1''s results only');
select is((select count(*)::int from public.results), 6, 'mentor reads all 6 revisions of the mentee');
reset role;
select tests.as_user('11111111-0000-0000-0000-000000000001');  -- S1
select is(tests.readable(),
  array['dddddddd-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002']::uuid[],
  'student S1 reads only own results');
reset role;
select tests.as_user('11111111-0000-0000-0000-000000000003');  -- S3
select is(tests.readable(), array['dddddddd-0000-0000-0000-000000000006']::uuid[],
  'student S3 reads only own results');
reset role;
select tests.as_user('22222222-0000-0000-0000-000000000003');  -- MN
select is(tests.readable(), array['dddddddd-0000-0000-0000-000000000003']::uuid[],
  'new mentor reads the mentee''s results');
reset role;
select tests.as_user('22222222-0000-0000-0000-000000000004');  -- H1, HOD of D1
select is(tests.readable(),
  array['dddddddd-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002',
        'dddddddd-0000-0000-0000-000000000003']::uuid[],
  'HOD reads results of department students (S1, S2), not S3');
reset role;
select tests.as_user('22222222-0000-0000-0000-000000000006');  -- C, creator without links
select is(tests.readable(),
  array['dddddddd-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002',
        'dddddddd-0000-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000006']::uuid[],
  'item creator reads results of own items');
reset role;

select * from finish();
rollback;
