-- Task 3: items, invitations, targeting (create_item / respond_to_invitation) and RLS.
-- Follows the fixture/helper pattern of 10_visibility.sql.
begin;

create extension if not exists pgtap with schema extensions;

select plan(72);

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

-- Named ids captured during the test (item ids returned by create_item).
create table tests.ids (name text primary key, id uuid);
grant select, insert on tests.ids to authenticated;

grant execute on all functions in schema tests to authenticated;

-- ---------------------------------------------------------------- fixture ids
-- students     11111111-...-0001 S1 (D1, year 1)   0002 S2 (D1, year 2)
--                          0003 S3 (D2, year 3)   0004 S4 (D2, year 4)
--                          0005 S5 inactive student (D1)
-- faculty      22222222-...-0001 M1 mentor of S1
--                          0002 M2 mentor of S3 and lead of group G (S1, S2)
--                          0003 H1 HOD of D1 (S1, S2, S5)
--                          0004 H2 HOD of D2 (S3, S4)
--                          0005 F0 faculty with no links
--                          0006 X  inactive faculty, active mentorship of S2
-- admin        33333333-...-0001, principal 44444444-...-0001
-- departments  aaaaaaaa-...-0001 D1, -0002 D2;  group bbbbbbbb-...-0001 G

select tests.make_user('11111111-0000-0000-0000-000000000001', 'student', 's1');
select tests.make_user('11111111-0000-0000-0000-000000000002', 'student', 's2');
select tests.make_user('11111111-0000-0000-0000-000000000003', 'student', 's3');
select tests.make_user('11111111-0000-0000-0000-000000000004', 'student', 's4');
select tests.make_user('11111111-0000-0000-0000-000000000005', 'student', 's5', false);
select tests.make_user('22222222-0000-0000-0000-000000000001', 'faculty', 'm1');
select tests.make_user('22222222-0000-0000-0000-000000000002', 'faculty', 'm2');
select tests.make_user('22222222-0000-0000-0000-000000000003', 'faculty', 'h1');
select tests.make_user('22222222-0000-0000-0000-000000000004', 'faculty', 'h2');
select tests.make_user('22222222-0000-0000-0000-000000000005', 'faculty', 'f0');
select tests.make_user('22222222-0000-0000-0000-000000000006', 'faculty', 'x', false);
select tests.make_user('33333333-0000-0000-0000-000000000001', 'admin', 'admin');
select tests.make_user('44444444-0000-0000-0000-000000000001', 'principal', 'principal');

insert into public.departments (id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'D1'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'D2');

insert into public.groups (id, name) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'G');

insert into public.student_year (student_id, year) values
  ('11111111-0000-0000-0000-000000000001', 1),
  ('11111111-0000-0000-0000-000000000002', 2),
  ('11111111-0000-0000-0000-000000000003', 3),
  ('11111111-0000-0000-0000-000000000004', 4),
  ('11111111-0000-0000-0000-000000000005', 1);

insert into public.department_memberships (student_id, department_id, valid_from) values
  ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', current_date - 100),
  ('11111111-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', current_date - 100),
  ('11111111-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000002', current_date - 100),
  ('11111111-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000002', current_date - 100),
  ('11111111-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', current_date - 100);

insert into public.hod_assignments (faculty_id, department_id, valid_from) values
  ('22222222-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', current_date - 100),
  ('22222222-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000002', current_date - 100);

insert into public.mentorships (mentor_id, student_id, valid_from) values
  ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', current_date - 100),
  ('22222222-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000003', current_date - 100),
  ('22222222-0000-0000-0000-000000000006', '11111111-0000-0000-0000-000000000002', current_date - 100);

insert into public.group_leads (group_id, faculty_id, valid_from) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', current_date - 100);

insert into public.group_members (group_id, student_id, valid_from) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', current_date - 100),
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002', current_date - 100);

-- ---------------------------------------------------------------- structure
select ok(
  (select bool_and(c.relrowsecurity) from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relname in ('items', 'invitations')
    having count(*) = 2),
  'RLS is enabled on items and invitations');

select is(
  (select count(*)::int from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity),
  0, 'no table in public is left without RLS');

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename in ('items', 'invitations') and cmd <> 'SELECT'),
  0, 'items and invitations have no insert/update/delete policies');

select ok(
  not bool_or(has_table_privilege(r, 'public.' || t, p)),
  'authenticated and anon have no INSERT/UPDATE/DELETE/TRUNCATE on items or invitations')
from unnest(array['items', 'invitations']) t,
     unnest(array['authenticated', 'anon']) r,
     unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) p;

select ok(
  not has_function_privilege('anon', 'public.create_item(jsonb, uuid[], uuid[], smallint[], uuid[])', 'EXECUTE')
  and not has_function_privilege('anon', 'public.respond_to_invitation(uuid, public.invitation_status)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.create_item(jsonb, uuid[], uuid[], smallint[], uuid[])', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.respond_to_invitation(uuid, public.invitation_status)', 'EXECUTE'),
  'create_item / respond_to_invitation: executable by authenticated only, not anon');

select is(
  (select array_agg(e.enumlabel order by e.enumsortorder) from pg_enum e
    where e.enumtypid = 'public.item_type'::regtype),
  array['hackathon', 'internship', 'event', 'meeting']::name[], 'item_type values');

select is(
  (select array_agg(e.enumlabel order by e.enumsortorder) from pg_enum e
    where e.enumtypid = 'public.invitation_status'::regtype),
  array['invited', 'joined', 'declined']::name[], 'invitation_status values');

-- ---------------------------------------------------------------- create_item: mentor M1
select tests.as_user('22222222-0000-0000-0000-000000000001');
-- S3 is not M1's mentee: must be silently dropped.
insert into tests.ids select 'm1_item', public.create_item(
  '{"type":"hackathon","title":"Smart India Hackathon","description":"d","meeting_url":null,
    "starts_at":"2026-12-01T10:00:00Z","requires_confirmation":true,"requires_proof":true}'::jsonb,
  null, null, null,
  array['11111111-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000003']::uuid[]);
select isnt((select id from tests.ids where name = 'm1_item'), null, 'mentor M1 can create an item');
select is(
  array(select student_id from public.invitations
        where item_id = (select id from tests.ids where name = 'm1_item')),
  array['11111111-0000-0000-0000-000000000001']::uuid[],
  'M1 sees invitations of own item: only own mentee S1');

-- deadline already passed (for the late-response test)
insert into tests.ids select 'late_item', public.create_item(
  jsonb_build_object('type', 'internship', 'title', 'Closed internship',
                     'deadline', now() - interval '1 hour'),
  null, null, null, array['11111111-0000-0000-0000-000000000001']::uuid[]);
reset role;

select is(
  (select count(*)::int from public.invitations
    where item_id = (select id from tests.ids where name = 'm1_item')
      and student_id = '11111111-0000-0000-0000-000000000003'),
  0, 'mentor targeting a student outside their mentees creates no invitation for them');
select is(
  (select row(type, title, requires_confirmation, requires_proof, created_by, starts_at)::text
    from public.items where id = (select id from tests.ids where name = 'm1_item')),
  row('hackathon'::public.item_type, 'Smart India Hackathon', true, true,
      '22222222-0000-0000-0000-000000000001'::uuid, '2026-12-01T10:00:00Z'::timestamptz)::text,
  'item stored with given fields and created_by = caller');
select is(
  (select status from public.invitations
    where item_id = (select id from tests.ids where name = 'm1_item')),
  'invited'::public.invitation_status, 'new invitation starts as invited');
select isnt((select created_at from public.items where id = (select id from tests.ids where name = 'm1_item')),
  null, 'items.created_at is set');

-- ---------------------------------------------------------------- create_item: group lead M2 (union)
select tests.as_user('22222222-0000-0000-0000-000000000002');
-- group G (S1, S2) + hand-picked S3 (mentee) + S1 again: union, no duplicates.
insert into tests.ids select 'm2_item', public.create_item(
  '{"type":"event","title":"Prime Project demo day"}'::jsonb,
  array['bbbbbbbb-0000-0000-0000-000000000001']::uuid[], null, null,
  array['11111111-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001']::uuid[]);
reset role;

select is(
  array(select student_id from public.invitations
        where item_id = (select id from tests.ids where name = 'm2_item') order by student_id),
  array['11111111-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002',
        '11111111-0000-0000-0000-000000000003']::uuid[],
  'group + hand-picked students yields the union (S1, S2, S3) with no duplicates');
select is(
  (select row(requires_confirmation, requires_proof)::text from public.items
    where id = (select id from tests.ids where name = 'm2_item')),
  row(false, false)::text, 'requires_confirmation / requires_proof default to false');

-- ---------------------------------------------------------------- create_item: HOD by department / year
select tests.as_user('22222222-0000-0000-0000-000000000003');  -- H1, HOD of D1
-- department D1 (S1, S2; S5 inactive) + years {3} (S3, not visible to H1)
insert into tests.ids select 'h1_item', public.create_item(
  '{"type":"meeting","title":"D1 meet","meeting_url":"https://meet.google.com/abc"}'::jsonb,
  null, array['aaaaaaaa-0000-0000-0000-000000000001']::uuid[], array[3]::smallint[], null);
reset role;
select is(
  array(select student_id from public.invitations
        where item_id = (select id from tests.ids where name = 'h1_item') order by student_id),
  array['11111111-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002']::uuid[],
  'HOD targeting department + a year resolves to visible active students only (no S3, no inactive S5)');

select tests.as_user('22222222-0000-0000-0000-000000000004');  -- H2, HOD of D2
insert into tests.ids select 'h2_item', public.create_item(
  '{"type":"internship","title":"D2 internship drive"}'::jsonb,
  null, null, array[3, 4]::smallint[], null);
reset role;
select is(
  array(select student_id from public.invitations
        where item_id = (select id from tests.ids where name = 'h2_item') order by student_id),
  array['11111111-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000004']::uuid[],
  'HOD H2 targeting years 3,4 invites S3, S4');

-- ---------------------------------------------------------------- create_item: zero invitations
select tests.as_user('22222222-0000-0000-0000-000000000005');  -- F0, no links
insert into tests.ids select 'f0_item', public.create_item(
  '{"type":"event","title":"Nobody visible"}'::jsonb,
  null, null, null, array['11111111-0000-0000-0000-000000000001']::uuid[]);
select isnt((select id from tests.ids where name = 'f0_item'), null,
  'item with zero resulting invitations is allowed and returns an id');
select is((select count(*)::int from public.items where id = (select id from tests.ids where name = 'f0_item')),
  1, 'creator sees own item even with zero invitations');
select is((select count(*)::int from public.invitations), 0, 'F0 sees 0 invitations');
select is((select count(*)::int from public.items), 1, 'F0 sees only own item');
reset role;
select is((select count(*)::int from public.invitations
            where item_id = (select id from tests.ids where name = 'f0_item')),
  0, 'F0''s item has zero invitations (S1 not visible to F0)');

-- ---------------------------------------------------------------- create_item: rejections
select tests.as_user('22222222-0000-0000-0000-000000000001');
select throws_ok(
  $$select public.create_item('{"type":"party","title":"x"}'::jsonb, null, null, null, null)$$,
  '22023', null, 'create_item rejects an unknown type');
select throws_ok(
  $$select public.create_item('{"type":"event","title":"   "}'::jsonb, null, null, null, null)$$,
  '22023', null, 'create_item rejects an empty title');
select throws_ok(
  $$select public.create_item('{"type":"event"}'::jsonb, null, null, null, null)$$,
  '22023', null, 'create_item rejects a missing title');
select throws_ok(
  $$insert into public.items (type, title, created_by)
    values ('event', 'direct', '22222222-0000-0000-0000-000000000001')$$,
  '42501', null, 'faculty cannot insert items directly');
reset role;

select tests.as_user('11111111-0000-0000-0000-000000000001');
select throws_ok(
  $$select public.create_item('{"type":"event","title":"x"}'::jsonb, null, null, null,
      array['11111111-0000-0000-0000-000000000001']::uuid[])$$,
  '42501', null, 'student cannot call create_item');
reset role;

select tests.as_user('22222222-0000-0000-0000-000000000006');
select throws_ok(
  $$select public.create_item('{"type":"event","title":"x"}'::jsonb, null, null, null,
      array['11111111-0000-0000-0000-000000000002']::uuid[])$$,
  '42501', null, 'deactivated faculty cannot call create_item');
reset role;

select tests.as_user('33333333-0000-0000-0000-000000000001');
select throws_ok(
  $$select public.create_item('{"type":"event","title":"x"}'::jsonb, null, null, null, null)$$,
  '42501', null, 'admin cannot call create_item');
reset role;

select tests.as_user('44444444-0000-0000-0000-000000000001');
select throws_ok(
  $$select public.create_item('{"type":"event","title":"x"}'::jsonb, null, null, null,
      array['11111111-0000-0000-0000-000000000001']::uuid[])$$,
  '42501', null, 'principal (read-only) cannot call create_item');
reset role;

-- ---------------------------------------------------------------- student visibility
select tests.as_user('11111111-0000-0000-0000-000000000001');  -- S1: m1, late, m2, h1
select is((select count(*)::int from public.invitations where student_id <> auth.uid()), 0,
  'student S1 sees only own invitations');
select is((select count(*)::int from public.invitations), 4, 'S1 sees all 4 own invitations');
select is(
  array(select id from public.items order by id),
  array(select id from tests.ids where name in ('m1_item', 'late_item', 'm2_item', 'h1_item') order by id),
  'S1 sees exactly the items behind own invitations');
reset role;

select tests.as_user('11111111-0000-0000-0000-000000000002');  -- S2: m2, h1
select is(
  (select count(*)::int from public.items
    where id in (select id from tests.ids where name in ('m1_item', 'h2_item', 'f0_item'))),
  0, 'student S2 cannot see items they were not invited to');
select is((select count(*)::int from public.items), 2, 'S2 sees only the 2 items they were invited to');
reset role;

-- ---------------------------------------------------------------- faculty visibility
select tests.as_user('22222222-0000-0000-0000-000000000002');  -- M2: mentor of S3, lead of G (S1, S2)
select is(
  array(select student_id from public.invitations
        where item_id = (select id from tests.ids where name = 'h2_item')),
  array['11111111-0000-0000-0000-000000000003']::uuid[],
  'mentor M2 reads mentee S3''s invitation on an item H2 created (not S4''s)');
select is(
  (select count(*)::int from public.items where id = (select id from tests.ids where name = 'h2_item')),
  1, 'M2 can see H2''s item through invited mentee S3');
select is(
  (select count(*)::int from public.items where id = (select id from tests.ids where name = 'f0_item')),
  0, 'M2 cannot see an item with no visible invitee that it did not create');
reset role;

select tests.as_user('22222222-0000-0000-0000-000000000001');  -- M1: mentee S1
select is(
  array(select student_id from public.invitations
        where item_id = (select id from tests.ids where name = 'm2_item')),
  array['11111111-0000-0000-0000-000000000001']::uuid[],
  'mentor M1 reads only mentee S1''s invitation on M2''s item (not S2, S3)');
reset role;

select tests.as_user('22222222-0000-0000-0000-000000000004');  -- H2 creator
select is(
  (select count(*)::int from public.invitations
    where item_id = (select id from tests.ids where name = 'h2_item')),
  2, 'creator H2 sees all invitations of own item');
reset role;

-- ---------------------------------------------------------------- principal / admin
select tests.as_user('44444444-0000-0000-0000-000000000001');
select is((select count(*)::int from public.items), 6, 'principal sees all 6 items');
select is((select count(*)::int from public.invitations), 9, 'principal sees all 9 invitations');
select throws_ok(
  $$select public.respond_to_invitation(
      (select id from public.invitations where student_id = '11111111-0000-0000-0000-000000000001' limit 1),
      'joined')$$,
  '42501', null, 'principal cannot respond to an invitation');
reset role;

select tests.as_user('33333333-0000-0000-0000-000000000001');
select is((select count(*)::int from public.items), 6, 'admin sees all 6 items');
select is((select count(*)::int from public.invitations), 9, 'admin sees all 9 invitations');
reset role;

-- ---------------------------------------------------------------- visible_student_ids() == can_see_student
-- The set-returning helper used by the policies must agree exactly with can_see_student
-- (the single source of truth) for every kind of caller.
create table tests.people as select id from public.profiles;
grant select on tests.people to authenticated;

select ok(
  not has_function_privilege('anon', 'public.visible_student_ids()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.created_item_ids()', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.visible_student_ids()', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.created_item_ids()', 'EXECUTE'),
  'visible_student_ids / created_item_ids: executable by authenticated only, not anon');

create function tests.check_visible(uid uuid, label text) returns text
language plpgsql as $$
begin
  perform tests.as_user(uid);
  return is(
    array(select v from public.visible_student_ids() v order by v),
    array(select id from tests.people where public.can_see_student(auth.uid(), id) order by id),
    'visible_student_ids() equals can_see_student filter for ' || label);
end $$;
grant execute on function tests.check_visible(uuid, text) to authenticated;

select tests.check_visible('11111111-0000-0000-0000-000000000001', 'student S1'); reset role;
select tests.check_visible('11111111-0000-0000-0000-000000000005', 'inactive student S5'); reset role;
select tests.check_visible('22222222-0000-0000-0000-000000000001', 'mentor M1'); reset role;
select tests.check_visible('22222222-0000-0000-0000-000000000002', 'group lead + mentor M2'); reset role;
select tests.check_visible('22222222-0000-0000-0000-000000000003', 'HOD H1'); reset role;
select tests.check_visible('22222222-0000-0000-0000-000000000005', 'faculty F0 without links'); reset role;
select tests.check_visible('22222222-0000-0000-0000-000000000006', 'inactive faculty X'); reset role;
select tests.check_visible('44444444-0000-0000-0000-000000000001', 'principal'); reset role;
select tests.check_visible('33333333-0000-0000-0000-000000000001', 'admin'); reset role;

-- non-trivial: the sets compared above are the expected ones
select tests.as_user('22222222-0000-0000-0000-000000000002');
select is(array(select v from public.visible_student_ids() v order by v),
  array['11111111-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002',
        '11111111-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000002']::uuid[],
  'M2 visible set: group S1, S2, mentee S3, plus self');
reset role;
select tests.as_user('44444444-0000-0000-0000-000000000001');
select is((select count(*)::int from public.visible_student_ids() v
           where v in (select id from public.profiles where role = 'student')), 5,
  'principal visible set covers all 5 students');
reset role;
select tests.as_user('22222222-0000-0000-0000-000000000006');
select is((select count(*)::int from public.visible_student_ids()), 0,
  'inactive faculty X visible set is empty despite an active mentorship');
reset role;

-- ---------------------------------------------------------------- respond_to_invitation
select tests.as_user('11111111-0000-0000-0000-000000000001');
select lives_ok(
  $$select public.respond_to_invitation(
      (select id from public.invitations where item_id = (select id from tests.ids where name = 'm1_item')),
      'joined')$$,
  'S1 joins the M1 item');
select is(
  (select row(status, responded_at is not null)::text from public.invitations
    where item_id = (select id from tests.ids where name = 'm1_item')),
  row('joined'::public.invitation_status, true)::text, 'status joined and responded_at set');

select lives_ok(
  $$select public.respond_to_invitation(
      (select id from public.invitations where item_id = (select id from tests.ids where name = 'm2_item')),
      'declined')$$,
  'S1 declines the M2 item');
insert into tests.ids select 'm2_s1_inv', id from public.invitations
  where item_id = (select id from tests.ids where name = 'm2_item');
select lives_ok(
  $$select public.respond_to_invitation(
      (select id from public.invitations where item_id = (select id from tests.ids where name = 'm2_item')),
      'joined')$$,
  'S1 joins again after declining (before deadline)');
select is(
  (select array_agg(row(id, status)::text) from public.invitations
    where item_id = (select id from tests.ids where name = 'm2_item')),
  array[row((select id from tests.ids where name = 'm2_s1_inv'), 'joined'::public.invitation_status)::text],
  'decline then join updates the same row: one invitation, status joined');

select throws_ok(
  $$select public.respond_to_invitation(
      (select id from public.invitations where item_id = (select id from tests.ids where name = 'late_item')),
      'joined')$$,
  'P0001', 'deadline has passed', 'joining after the deadline fails');
select throws_ok(
  $$select public.respond_to_invitation(
      (select id from public.invitations where item_id = (select id from tests.ids where name = 'h1_item')),
      'invited')$$,
  '22023', null, 'status must be joined or declined');
select throws_ok(
  $$update public.invitations set status = 'joined'
    where item_id = (select id from tests.ids where name = 'h1_item')$$,
  '42501', null, 'student cannot update an invitation directly');
reset role;

select is(
  (select status from public.invitations
    where item_id = (select id from tests.ids where name = 'late_item')),
  'invited'::public.invitation_status, 'late invitation is unchanged');

-- other people cannot respond on S1's behalf (ids captured as postgres)
insert into tests.ids select 's1_h1_inv', id from public.invitations
  where item_id = (select id from tests.ids where name = 'h1_item')
    and student_id = '11111111-0000-0000-0000-000000000001';
insert into tests.ids select 's2_h1_inv', id from public.invitations
  where item_id = (select id from tests.ids where name = 'h1_item')
    and student_id = '11111111-0000-0000-0000-000000000002';
select tests.as_user('11111111-0000-0000-0000-000000000002');
select throws_ok(
  $$select public.respond_to_invitation((select id from tests.ids where name = 's1_h1_inv'), 'joined')$$,
  '42501', null, 'another student cannot respond to S1''s invitation');
reset role;

select tests.as_user('22222222-0000-0000-0000-000000000001');
select throws_ok(
  $$select public.respond_to_invitation((select id from tests.ids where name = 's1_h1_inv'), 'joined')$$,
  '42501', null, 'mentor cannot respond to a mentee''s invitation');
reset role;

-- deactivated student cannot respond
update public.profiles set active = false where id = '11111111-0000-0000-0000-000000000002';
select tests.as_user('11111111-0000-0000-0000-000000000002');
select throws_ok(
  $$select public.respond_to_invitation((select id from tests.ids where name = 's2_h1_inv'), 'joined')$$,
  '42501', null, 'deactivated student cannot respond');
select is((select count(*)::int from public.invitations), 0, 'deactivated student sees 0 invitations');
reset role;

select is(
  (select count(*)::int from public.invitations
    where item_id = (select id from tests.ids where name = 'h1_item') and status <> 'invited'),
  0, 'h1 item invitations untouched by rejected responses');

select * from finish();
rollback;
