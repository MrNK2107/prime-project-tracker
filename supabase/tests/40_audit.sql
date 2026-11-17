-- Task 5: audit log (append-only table, change triggers, read access, privacy).
-- Follows the fixture/helper pattern of 10_visibility.sql, 20_items.sql and 30_results.sql.
begin;

create extension if not exists pgtap with schema extensions;

select plan(67);

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

-- Audit position markers: rows with id > mark were written after the mark (read as owner).
create table tests.marks (name text primary key, n bigint);
create function tests.mark(m text) returns void
language sql as $$
  insert into tests.marks values (m, (select coalesce(max(id), 0) from public.audit_log))
  on conflict (name) do update set n = excluded.n;
$$;
create function tests.since(m text) returns setof public.audit_log
language sql as $$
  select a.* from public.audit_log a
  where a.id > (select n from tests.marks where name = m)
  order by a.id;
$$;

grant execute on all functions in schema tests to authenticated;

-- ---------------------------------------------------------------- fixture ids
-- students     11111111-...-0001 S1   0002 S2   0003 S3
-- faculty      22222222-...-0001 M1 mentor of S1
--                          0002 MO old mentor of S2 (reassigned during the test)
--                          0003 MN new mentor of S2
--                          0004 H1 HOD of D1 (S1, S2)
--                          0006 C  creator of every item
-- admin        33333333-...-0001, principal 44444444-...-0001
-- items        cccccccc-...-0001 I_conf (requires confirmation + proof)
--                          0003 I_conf2 (requires confirmation)
-- invitations  dddddddd-...-0001 inv1 I_conf  S1 joined
--                          0003 inv3 I_conf2 S2 joined

select tests.make_user('11111111-0000-0000-0000-000000000001', 'student', 's1');
select tests.make_user('11111111-0000-0000-0000-000000000002', 'student', 's2');
select tests.make_user('11111111-0000-0000-0000-000000000003', 'student', 's3');
select tests.make_user('22222222-0000-0000-0000-000000000001', 'faculty', 'm1');
select tests.make_user('22222222-0000-0000-0000-000000000002', 'faculty', 'mo');
select tests.make_user('22222222-0000-0000-0000-000000000003', 'faculty', 'mn');
select tests.make_user('22222222-0000-0000-0000-000000000004', 'faculty', 'h1');
select tests.make_user('22222222-0000-0000-0000-000000000006', 'faculty', 'c');
select tests.make_user('33333333-0000-0000-0000-000000000001', 'admin', 'admin');
select tests.make_user('44444444-0000-0000-0000-000000000001', 'principal', 'principal');

insert into public.departments (id, name) values ('aaaaaaaa-0000-0000-0000-000000000001', 'D1');
insert into public.department_memberships (student_id, department_id, valid_from) values
  ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', current_date - 100),
  ('11111111-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', current_date - 100);
insert into public.hod_assignments (faculty_id, department_id, valid_from) values
  ('22222222-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', current_date - 100);
insert into public.mentorships (id, mentor_id, student_id, valid_from) values
  ('eeeeeeee-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', current_date - 100),
  ('eeeeeeee-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000002', current_date - 100);

insert into public.items (id, type, title, description, requires_confirmation, requires_proof, created_by) values
  ('cccccccc-0000-0000-0000-000000000001', 'hackathon', 'ZQX-ITEM-TITLE', 'ZQX-ITEM-DESC', true, true, '22222222-0000-0000-0000-000000000006'),
  ('cccccccc-0000-0000-0000-000000000003', 'internship', 'I_conf2', null, true, false, '22222222-0000-0000-0000-000000000006');
insert into public.invitations (id, item_id, student_id, status, responded_at) values
  ('dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'joined', now()),
  ('dddddddd-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000002', 'joined', now());

-- ---------------------------------------------------------------- structure
select ok(
  (select c.relrowsecurity from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relname = 'audit_log'),
  'RLS is enabled on audit_log');

select columns_are('public', 'audit_log',
  array['id', 'at', 'actor_id', 'action', 'entity', 'entity_id', 'detail'],
  'audit_log has exactly the planned columns');

select is(
  (select array_agg(policyname::text || ':' || cmd order by policyname) from pg_policies
    where schemaname = 'public' and tablename = 'audit_log'),
  array['audit_select:SELECT'],
  'audit_log has a single SELECT policy and no insert/update/delete policies');

select ok(
  not bool_or(has_table_privilege(r, 'public.audit_log', p)),
  'no role has UPDATE/DELETE/TRUNCATE on audit_log (anon, authenticated, service_role)')
from unnest(array['anon', 'authenticated', 'service_role']) r,
     unnest(array['UPDATE', 'DELETE', 'TRUNCATE']) p;

select ok(
  not has_table_privilege('anon', 'public.audit_log', 'SELECT')
  and not has_table_privilege('anon', 'public.audit_log', 'INSERT')
  and has_table_privilege('authenticated', 'public.audit_log', 'SELECT')
  and not has_table_privilege('authenticated', 'public.audit_log', 'INSERT')
  and has_table_privilege('service_role', 'public.audit_log', 'INSERT'),
  'audit_log: SELECT for authenticated, INSERT for service_role only, nothing for anon');

select ok(
  bool_and(not has_function_privilege(r, f, 'EXECUTE')),
  'audit trigger functions are not executable by public/anon/authenticated/service_role')
from unnest(array['public.audit_row_change()', 'public.audit_log_immutable()']) f,
     unnest(array['public', 'anon', 'authenticated', 'service_role']) r;

select is(
  (select array_agg(distinct c.relname::text order by c.relname::text)
     from pg_trigger t
     join pg_class c on c.oid = t.tgrelid
    where not t.tgisinternal and t.tgfoid = 'public.audit_row_change()'::regprocedure),
  array['department_memberships', 'departments', 'group_leads', 'group_members', 'groups',
        'hod_assignments', 'invitations', 'items', 'mentorships', 'profiles', 'results',
        'student_year'],
  'audit trigger is attached to all 12 audited tables');

select is(
  (select count(*)::int from pg_trigger t
    where t.tgrelid = 'public.audit_log'::regclass and not t.tgisinternal
      and t.tgfoid = 'public.audit_log_immutable()'::regprocedure),
  2, 'audit_log has the two append-only guard triggers (update/delete rows, truncate)');

-- ---------------------------------------------------------------- fixture writes were logged
select is(
  (select row(a.action, a.actor_id, a.detail -> 'row' ->> 'role')::text from public.audit_log a
    where a.entity = 'profiles' and a.entity_id = '11111111-0000-0000-0000-000000000001'),
  row('insert', null::uuid, 'student')::text,
  'profile insert logged (actor null for a server-side write) with role');

select is(
  (select count(*)::int from public.audit_log a
    where a.entity = 'mentorships' and a.action = 'insert'
      and a.entity_id = 'eeeeeeee-0000-0000-0000-000000000002'
      and a.detail -> 'row' ->> 'mentor_id' = '22222222-0000-0000-0000-000000000002'),
  1, 'mentorship insert logged with its ids');

select is(
  (select count(*)::int from public.audit_log a
    where a.entity = 'items' and a.entity_id = 'cccccccc-0000-0000-0000-000000000001'
      and a.detail -> 'row' ->> 'requires_proof' = 'true'),
  1, 'item insert logged with non-sensitive flags');

select is(
  (select count(*)::int from public.audit_log a
    where (a.entity, a.action) in (('invitations', 'insert'), ('departments', 'insert'),
                                   ('department_memberships', 'insert'), ('hod_assignments', 'insert'))),
  6, 'invitation, department, department_membership and hod_assignment inserts logged');

-- ---------------------------------------------------------------- results: submit and confirm
select tests.mark('submit');
select tests.as_user('11111111-0000-0000-0000-000000000001');  -- S1
select lives_ok(
  $$insert into tests.ids select 'r1', public.submit_result(
      'dddddddd-0000-0000-0000-000000000001', 'ZQX-SECRET-OUTCOME', 'ZQX-SECRET-DETAILS',
      'proofs/s1/ZQX-SECRET-PROOF.pdf')$$,
  'S1 submits a result with distinctive text');
reset role;

select is(
  (select array_agg(row(s.action, s.entity, s.entity_id, s.actor_id, s.detail -> 'row' ->> 'status')::text)
     from tests.since('submit') s),
  array[row('insert', 'results', (select id::text from tests.ids where name = 'r1'),
            '11111111-0000-0000-0000-000000000001'::uuid, 'submitted')::text],
  'submitting writes exactly one audit row (insert, results, the student as actor, status)');

select tests.mark('confirm');
select tests.as_user('22222222-0000-0000-0000-000000000006');  -- C (creator)
select lives_ok(
  $$select public.review_result((select id from tests.ids where name = 'r1'), 'confirm', 'ZQX-SECRET-NOTE')$$,
  'creator confirms the result');
reset role;

select is(
  (select count(*)::int from tests.since('confirm')),
  1, 'confirming writes exactly one audit row');

select is(
  (select row(s.action, s.entity, s.entity_id, s.actor_id)::text from tests.since('confirm') s),
  row('update', 'results', (select id::text from tests.ids where name = 'r1'),
      '22222222-0000-0000-0000-000000000006'::uuid)::text,
  'confirm row: update on the result, confirmer as actor');

select is(
  (select row(s.detail -> 'old' ->> 'status', s.detail -> 'new' ->> 'status',
              s.detail -> 'new' ->> 'confirmed_by', s.detail -> 'row' ->> 'revision',
              s.detail -> 'row' ->> 'invitation_id')::text
     from tests.since('confirm') s),
  row('submitted', 'confirmed', '22222222-0000-0000-0000-000000000006', '1',
      'dddddddd-0000-0000-0000-000000000001')::text,
  'confirm row detail: old/new status, confirmed_by, revision and invitation id');

select ok(
  (select (s.detail -> 'changed') ?& array['status', 'confirmed_by', 'confirmed_at', 'review_note']
     from tests.since('confirm') s),
  'confirm row lists the changed column names (review_note by name only)');

select ok(
  (select not (s.detail -> 'old' ? 'review_note') and not (s.detail -> 'new' ? 'review_note')
     from tests.since('confirm') s),
  'confirm row carries no review_note value');

-- correction: request + confirm supersedes the old row (two updates, confirmer as actor)
select tests.as_user('11111111-0000-0000-0000-000000000001');
select lives_ok(
  $$insert into tests.ids select 'r2', public.request_correction(
      (select id from tests.ids where name = 'r1'), 'ZQX-SECRET-CORRECTION', 'ZQX-SECRET-CDETAILS',
      'proofs/s1/ZQX-SECRET-CPROOF.pdf')$$,
  'S1 requests a correction');
reset role;
select tests.mark('supersede');
select tests.as_user('22222222-0000-0000-0000-000000000006');
select lives_ok(
  $$select public.review_result((select id from tests.ids where name = 'r2'), 'confirm', null)$$,
  'creator confirms the correction');
reset role;
select is(
  (select array_agg(row(s.entity_id, s.actor_id, s.detail -> 'old' ->> 'status',
                        s.detail -> 'new' ->> 'status')::text order by s.id)
     from tests.since('supersede') s),
  array[row((select id::text from tests.ids where name = 'r1'),
            '22222222-0000-0000-0000-000000000006'::uuid, 'confirmed', 'superseded')::text,
        row((select id::text from tests.ids where name = 'r2'),
            '22222222-0000-0000-0000-000000000006'::uuid, 'submitted', 'confirmed')::text],
  'confirming a correction logs the supersede and the confirm');

-- send back with a note
select tests.as_user('11111111-0000-0000-0000-000000000002');  -- S2
select lives_ok(
  $$insert into tests.ids select 'r3', public.submit_result(
      'dddddddd-0000-0000-0000-000000000003', 'ZQX-SECRET-S2', 'ZQX-SECRET-S2D', null)$$,
  'S2 submits a result');
reset role;
select tests.mark('sendback');
select tests.as_user('22222222-0000-0000-0000-000000000002');  -- MO, current mentor of S2
select lives_ok(
  $$select public.review_result((select id from tests.ids where name = 'r3'), 'send_back', 'ZQX-SECRET-SENDBACK')$$,
  'mentor sends the result back with a note');
reset role;
select is(
  (select array_agg(row(s.actor_id, s.detail -> 'old' ->> 'status', s.detail -> 'new' ->> 'status')::text)
     from tests.since('sendback') s),
  array[row('22222222-0000-0000-0000-000000000002'::uuid, 'submitted', 'sent_back')::text],
  'send back logged with the mentor as actor and old/new status');

-- ---------------------------------------------------------------- privacy: result text never logged
select is(
  (select count(*)::int from public.audit_log a where to_jsonb(a)::text like '%ZQX-SECRET%'),
  0, 'no result outcome, details, proof path or review note appears anywhere in audit_log');
select is(
  (select count(*)::int from public.audit_log a where to_jsonb(a)::text like '%ZQX-ITEM%'),
  0, 'no item title or description appears anywhere in audit_log');
select is(
  (select count(*)::int from public.audit_log a where to_jsonb(a)::text like '%@test.local%'),
  0, 'no email appears anywhere in audit_log');
select is(
  (select count(*)::int from public.audit_log a
    where a.entity = 'results' and (a.detail -> 'row' ? 'outcome' or a.detail -> 'row' ? 'details'
                                    or a.detail -> 'row' ? 'proof_path' or a.detail -> 'row' ? 'review_note')),
  0, 'result rows never carry outcome/details/proof_path/review_note keys');

-- ---------------------------------------------------------------- items and invitations via functions
select tests.mark('create_item');
select tests.as_user('22222222-0000-0000-0000-000000000001');  -- M1 targets S1
select lives_ok(
  $$insert into tests.ids select 'item_new', public.create_item(
      '{"type":"event","title":"ZQX-ITEM-NEW","description":"ZQX-ITEM-NEWD"}'::jsonb,
      null, null, null, array['11111111-0000-0000-0000-000000000001']::uuid[])$$,
  'mentor creates an item for S1');
reset role;
select is(
  (select array_agg(s.entity || ':' || s.action || ':' || s.actor_id order by s.id) from tests.since('create_item') s),
  array['items:insert:22222222-0000-0000-0000-000000000001',
        'invitations:insert:22222222-0000-0000-0000-000000000001'],
  'create_item logs the item and its invitation with the creator as actor');

select tests.mark('respond');
select tests.as_user('11111111-0000-0000-0000-000000000001');
select lives_ok(
  $$select public.respond_to_invitation(
      (select inv.id from public.invitations inv
        where inv.item_id = (select id from tests.ids where name = 'item_new')), 'joined')$$,
  'S1 joins the new invitation');
reset role;
select is(
  (select array_agg(row(s.entity, s.action, s.actor_id, s.detail -> 'old' ->> 'status',
                        s.detail -> 'new' ->> 'status')::text) from tests.since('respond') s),
  array[row('invitations', 'update', '11111111-0000-0000-0000-000000000001'::uuid,
            'invited', 'joined')::text],
  'responding logs the invitation status change with the student as actor');

select is(
  (select count(*)::int from public.audit_log a where to_jsonb(a)::text like '%ZQX-ITEM%'),
  0, 'item text from create_item never appears in audit_log');

-- ---------------------------------------------------------------- no-op updates are not logged
select tests.mark('noop');
update public.profiles set role = role where id = '11111111-0000-0000-0000-000000000001';
update public.mentorships set valid_to = valid_to where id = 'eeeeeeee-0000-0000-0000-000000000001';
select is((select count(*)::int from tests.since('noop')), 0, 'no-op updates write no audit rows');

-- ---------------------------------------------------------------- mentor reassignment (admin)
select tests.mark('reassign');
select tests.as_user('33333333-0000-0000-0000-000000000001');  -- admin
select lives_ok(
  $$update public.mentorships set valid_to = current_date - 1
    where id = 'eeeeeeee-0000-0000-0000-000000000002'$$,
  'admin ends the old mentorship');
select lives_ok(
  $$insert into public.mentorships (id, mentor_id, student_id, valid_from)
    values ('eeeeeeee-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000003',
            '11111111-0000-0000-0000-000000000002', current_date)$$,
  'admin inserts the new mentorship');
reset role;

select is(
  (select array_agg(row(s.action, s.entity, s.entity_id, s.actor_id)::text order by s.id)
     from tests.since('reassign') s),
  array[row('update', 'mentorships', 'eeeeeeee-0000-0000-0000-000000000002',
            '33333333-0000-0000-0000-000000000001'::uuid)::text,
        row('insert', 'mentorships', 'eeeeeeee-0000-0000-0000-000000000003',
            '33333333-0000-0000-0000-000000000001'::uuid)::text],
  'reassignment writes an update (old link ended) and an insert (new link), admin as actor');

select is(
  (select row(s.detail -> 'changed', s.detail -> 'old' -> 'valid_to', s.detail -> 'new' ->> 'valid_to',
              s.detail -> 'row' ->> 'mentor_id', s.detail -> 'row' ->> 'student_id')::text
     from tests.since('reassign') s where s.action = 'update'),
  row('["valid_to"]'::jsonb, 'null'::jsonb, (current_date - 1)::text,
      '22222222-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000002')::text,
  'ended link detail: valid_to old null -> new, with mentor and student ids');

select is(
  (select row(s.detail -> 'row' ->> 'mentor_id', s.detail -> 'row' ->> 'student_id',
              s.detail -> 'row' ->> 'valid_from')::text
     from tests.since('reassign') s where s.action = 'insert'),
  row('22222222-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000002',
      current_date::text)::text,
  'new link detail: mentor, student and valid_from');

-- ---------------------------------------------------------------- profile role change (admin)
select tests.mark('profile');
select tests.as_user('33333333-0000-0000-0000-000000000001');
select lives_ok(
  $$update public.profiles
    set role = 'faculty', active = false, email = 'zqx-private@example.org', full_name = 'ZQX Private Name'
    where id = '11111111-0000-0000-0000-000000000003'$$,
  'admin changes S3 role/active and name/email');
reset role;

select is(
  (select row(s.action, s.entity, s.entity_id, s.actor_id,
              s.detail -> 'old' ->> 'role', s.detail -> 'new' ->> 'role',
              s.detail -> 'old' ->> 'active', s.detail -> 'new' ->> 'active')::text
     from tests.since('profile') s),
  row('update', 'profiles', '11111111-0000-0000-0000-000000000003',
      '33333333-0000-0000-0000-000000000001'::uuid,
      'student', 'faculty', 'true', 'false')::text,
  'profile change logs role and active old/new values with admin as actor');

select ok(
  (select (s.detail -> 'changed') ?& array['email', 'full_name', 'role', 'active']
     from tests.since('profile') s),
  'profile change lists email/full_name as changed column names');

select is(
  (select count(*)::int from public.audit_log a
    where to_jsonb(a)::text ilike '%zqx-private%' or to_jsonb(a)::text ilike '%ZQX Private%'),
  0, 'profile change never stores the email or full name values');

-- ---------------------------------------------------------------- read access
select tests.as_user('22222222-0000-0000-0000-000000000001');  -- mentor M1
select is((select count(*)::int from public.audit_log), 0, 'mentor reads 0 audit rows');
reset role;
select tests.as_user('11111111-0000-0000-0000-000000000001');  -- student S1
select is((select count(*)::int from public.audit_log), 0, 'student reads 0 audit rows');
reset role;
select tests.as_user('22222222-0000-0000-0000-000000000004');  -- HOD H1
select is((select count(*)::int from public.audit_log), 0, 'HOD reads 0 audit rows');
reset role;
select tests.as_user('22222222-0000-0000-0000-000000000006');  -- item creator C
select is((select count(*)::int from public.audit_log), 0, 'item creator reads 0 audit rows');
reset role;

select tests.as_user('44444444-0000-0000-0000-000000000001');  -- principal
select ok((select count(*) from public.audit_log) > 0, 'principal reads audit rows');
reset role;
select tests.as_user('33333333-0000-0000-0000-000000000001');  -- admin
select ok((select count(*) from public.audit_log) > 0, 'admin reads audit rows');
reset role;

-- deactivated principal reads nothing
update public.profiles set active = false where id = '44444444-0000-0000-0000-000000000001';
select tests.as_user('44444444-0000-0000-0000-000000000001');
select is((select count(*)::int from public.audit_log), 0, 'inactive principal reads 0 audit rows');
reset role;
update public.profiles set active = true where id = '44444444-0000-0000-0000-000000000001';

set local role anon;
select throws_ok($$select count(*) from public.audit_log$$, '42501', null, 'anon cannot select audit_log');
reset role;

-- ---------------------------------------------------------------- append-only: authenticated
select tests.as_user('33333333-0000-0000-0000-000000000001');  -- admin
select throws_ok($$update public.audit_log set action = 'x'$$, '42501', null, 'admin cannot update audit_log');
select throws_ok($$delete from public.audit_log$$, '42501', null, 'admin cannot delete from audit_log');
select throws_ok($$truncate public.audit_log$$, '42501', null, 'admin cannot truncate audit_log');
select throws_ok(
  $$insert into public.audit_log (actor_id, action, entity, entity_id) values (null, 'x', 'x', 'x')$$,
  '42501', null, 'admin cannot insert into audit_log directly');
reset role;
select tests.as_user('44444444-0000-0000-0000-000000000001');  -- principal
select throws_ok($$update public.audit_log set action = 'x'$$, '42501', null, 'principal cannot update audit_log');
select throws_ok($$delete from public.audit_log$$, '42501', null, 'principal cannot delete from audit_log');
reset role;

-- ---------------------------------------------------------------- append-only: service_role
set local role service_role;
select throws_ok($$update public.audit_log set action = 'x'$$, '42501', null, 'service_role cannot update audit_log');
select throws_ok($$delete from public.audit_log$$, '42501', null, 'service_role cannot delete from audit_log');
select throws_ok($$truncate public.audit_log$$, '42501', null, 'service_role cannot truncate audit_log');
select lives_ok(
  $$insert into public.audit_log (actor_id, action, entity, entity_id, detail)
    values ('44444444-0000-0000-0000-000000000001', 'proof_view', 'results', 'x', '{}')$$,
  'service_role can append (lib/audit.ts path)');
reset role;

-- ---------------------------------------------------------------- append-only: table owner (postgres)
select throws_ok($$update public.audit_log set action = 'x'$$, '42501', null, 'postgres cannot update audit_log');
select throws_ok($$delete from public.audit_log$$, '42501', null, 'postgres cannot delete from audit_log');
select throws_ok($$truncate public.audit_log$$, '42501', null, 'postgres cannot truncate audit_log');

select is(
  (select count(*)::int from public.audit_log where action = 'x'),
  0, 'no audit row was altered');

select * from finish();
rollback;
