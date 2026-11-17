-- Task 2: identity, relationship links, can_see_student and RLS on profiles/link tables.
--
-- Pattern for later test files (pg_prove runs each file in its own session, so helpers
-- are repeated per file and vanish with the rollback):
--   * fixtures are inserted as postgres (bypasses RLS) into auth.users + public.profiles
--   * select tests.as_user('<uuid>') switches to the authenticated role with that JWT sub
--   * reset role switches back to postgres
begin;

create extension if not exists pgtap with schema extensions;

select plan(62);

-- ---------------------------------------------------------------- helpers
create schema tests;
grant usage on schema tests to authenticated;

-- Become an authenticated user with the given auth.uid() for the rest of the transaction.
create function tests.as_user(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- Create an auth.users row plus its profile.
create function tests.make_user(uid uuid, r public.user_role, name text, is_active boolean default true)
returns void language plpgsql as $$
begin
  insert into auth.users (id, email, aud, role)
  values (uid, name || '@test.local', 'authenticated', 'authenticated');
  insert into public.profiles (id, email, full_name, role, active)
  values (uid, name || '@test.local', name, r, is_active);
end $$;

grant execute on all functions in schema tests to authenticated;

-- ---------------------------------------------------------------- fixture ids
-- students     11111111-...-0001..0004
-- faculty      22222222-...-0001 M1 mentor of S1
--                          0002 M2 mentor of S3 and lead of "Prime Project" (S1, S2)
--                          0003 H1 HOD of D1 (S1, S2)
--                          0004 H2 ex-HOD of D2 (ended yesterday)
--                          0005 F0 faculty with no links
--                          0006 X  inactive faculty, active mentorship of S2
-- admin        33333333-...-0001 (and a second admin -0002), principal 44444444-...-0001
-- departments  aaaaaaaa-...-0001 D1, -0002 D2;  group bbbbbbbb-...-0001 "Prime Project"

select tests.make_user('11111111-0000-0000-0000-000000000001', 'student', 's1');
select tests.make_user('11111111-0000-0000-0000-000000000002', 'student', 's2');
select tests.make_user('11111111-0000-0000-0000-000000000003', 'student', 's3');
select tests.make_user('11111111-0000-0000-0000-000000000004', 'student', 's4');
select tests.make_user('22222222-0000-0000-0000-000000000001', 'faculty', 'm1');
select tests.make_user('22222222-0000-0000-0000-000000000002', 'faculty', 'm2');
select tests.make_user('22222222-0000-0000-0000-000000000003', 'faculty', 'h1');
select tests.make_user('22222222-0000-0000-0000-000000000004', 'faculty', 'h2');
select tests.make_user('22222222-0000-0000-0000-000000000005', 'faculty', 'f0');
select tests.make_user('22222222-0000-0000-0000-000000000006', 'faculty', 'x', false);
select tests.make_user('33333333-0000-0000-0000-000000000001', 'admin', 'admin');
select tests.make_user('33333333-0000-0000-0000-000000000002', 'admin', 'admin2');
select tests.make_user('44444444-0000-0000-0000-000000000001', 'principal', 'principal');

insert into public.departments (id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'D1'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'D2');

insert into public.groups (id, name) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Prime Project');

insert into public.student_year (student_id, year) values
  ('11111111-0000-0000-0000-000000000001', 1),
  ('11111111-0000-0000-0000-000000000002', 2),
  ('11111111-0000-0000-0000-000000000003', 3),
  ('11111111-0000-0000-0000-000000000004', 4);

insert into public.department_memberships (student_id, department_id, valid_from) values
  ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', current_date - 100),
  ('11111111-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', current_date - 100),
  ('11111111-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000002', current_date - 100),
  ('11111111-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000002', current_date - 100);

insert into public.hod_assignments (faculty_id, department_id, valid_from, valid_to) values
  ('22222222-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', current_date - 100, null),
  ('22222222-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000002', current_date - 100, current_date - 1);

insert into public.mentorships (mentor_id, student_id, valid_from, valid_to) values
  ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', current_date - 100, null),
  -- ended yesterday: grants nothing
  ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000004', current_date - 100, current_date - 1),
  -- starts tomorrow: grants nothing yet
  ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002', current_date + 1, null),
  ('22222222-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000003', current_date - 100, null),
  -- inactive mentor: grants nothing
  ('22222222-0000-0000-0000-000000000006', '11111111-0000-0000-0000-000000000002', current_date - 100, null);

insert into public.group_leads (group_id, faculty_id, valid_from) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', current_date - 100);

insert into public.group_members (group_id, student_id, valid_from, valid_to) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', current_date - 100, null),
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002', current_date - 100, null),
  -- removed from group yesterday
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000004', current_date - 100, current_date - 1);

-- ---------------------------------------------------------------- structure
select ok(
  (select bool_and(c.relrowsecurity) from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relname in ('profiles','departments','student_year','department_memberships',
                        'hod_assignments','groups','group_members','group_leads','mentorships')
    having count(*) = 9),
  'RLS is enabled on all 9 identity tables');

select is(
  (select count(distinct tablename)::int from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles','departments','student_year','department_memberships',
                        'hod_assignments','groups','group_members','group_leads','mentorships')),
  9, 'every identity table has at least one policy');

select is(
  (select count(*)::int from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity),
  0, 'no table in public is left without RLS');

-- ---------------------------------------------------------------- can_see_student (as postgres)
select is(public.can_see_student('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001'),
  true, 'can_see_student: mentor -> own mentee');
select is(public.can_see_student('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000003'),
  false, 'can_see_student: mentor -> another mentor''s mentee');
select is(public.can_see_student('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000004'),
  false, 'can_see_student: ended mentorship grants nothing');
select is(public.can_see_student('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002'),
  false, 'can_see_student: future mentorship grants nothing yet');
select is(public.can_see_student('22222222-0000-0000-0000-000000000006', '11111111-0000-0000-0000-000000000002'),
  false, 'can_see_student: inactive viewer gets false despite an active link');
select is(public.can_see_student(null, '11111111-0000-0000-0000-000000000001'),
  false, 'can_see_student: null viewer -> false');
select is(public.can_see_student('44444444-0000-0000-0000-000000000001', null),
  false, 'can_see_student: null student -> false');
select is(public.can_see_student('11111111-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001'),
  true, 'can_see_student: student -> self');
select is(public.can_see_student('44444444-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000004'),
  true, 'can_see_student: principal -> any student');
select is(public.can_see_student('33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001'),
  true, 'can_see_student: admin -> any student (admin reads everything)');

-- ---------------------------------------------------------------- mentor M1
select tests.as_user('22222222-0000-0000-0000-000000000001');
select is(array(select id from public.profiles where role = 'student' order by id),
  array['11111111-0000-0000-0000-000000000001']::uuid[],
  'mentor M1 sees exactly own mentee S1 (not S3, not ended S4, not future S2)');
select is(public.can_see_student(auth.uid(), '11111111-0000-0000-0000-000000000001'), true,
  'M1 calling can_see_student for self as viewer works');
select is(public.can_see_student('44444444-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000003'), false,
  'an authenticated user cannot probe can_see_student on behalf of another viewer');
select is((select count(*)::int from public.profiles where role <> 'student'), 9,
  'M1 sees all 9 faculty/admin/principal profiles (names for display)');
select is(array(select student_id from public.mentorships order by student_id),
  array['11111111-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000002',
        '11111111-0000-0000-0000-000000000004']::uuid[],
  'M1 reads only own mentorship rows (incl. ended/future history)');
reset role;

-- ---------------------------------------------------------------- group lead M2
select tests.as_user('22222222-0000-0000-0000-000000000002');
select is(array(select id from public.profiles where role = 'student' order by id),
  array['11111111-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000002',
        '11111111-0000-0000-0000-000000000003']::uuid[],
  'group lead M2 sees active group members S1,S2 plus own mentee S3 (not removed S4)');
select is(array(select student_id from public.group_members order by student_id),
  array['11111111-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000002']::uuid[],
  'M2 reads membership rows only for students it can see');
reset role;

-- ---------------------------------------------------------------- HOD H1 / ex-HOD H2
select tests.as_user('22222222-0000-0000-0000-000000000003');
select is(array(select id from public.profiles where role = 'student' order by id),
  array['11111111-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000002']::uuid[],
  'HOD H1 sees exactly own department D1 (S1,S2)');
select is(array(select student_id from public.student_year order by student_id),
  array['11111111-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000002']::uuid[],
  'HOD H1 reads student_year only for own department');
reset role;

select tests.as_user('22222222-0000-0000-0000-000000000004');
select is((select count(*)::int from public.profiles where role = 'student'), 0,
  'ex-HOD H2 (assignment ended yesterday) sees 0 students');
reset role;

-- ---------------------------------------------------------------- faculty without links
select tests.as_user('22222222-0000-0000-0000-000000000005');
select is((select count(*)::int from public.profiles where role = 'student'), 0,
  'faculty F0 with no links sees 0 student profiles');
select is((select count(*)::int from public.mentorships), 0, 'F0 sees 0 mentorships');
select is((select count(*)::int from public.group_members), 0, 'F0 sees 0 group memberships');
select is((select count(*)::int from public.department_memberships), 0, 'F0 sees 0 department memberships');
select is((select count(*)::int from public.student_year), 0, 'F0 sees 0 student_year rows');
select is((select count(*)::int from public.departments), 2, 'F0 can read the 2 departments');
reset role;

-- ---------------------------------------------------------------- principal
select tests.as_user('44444444-0000-0000-0000-000000000001');
select is(array(select id from public.profiles where role = 'student' order by id),
  array['11111111-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000002',
        '11111111-0000-0000-0000-000000000003','11111111-0000-0000-0000-000000000004']::uuid[],
  'principal sees all 4 students');
select is((select count(*)::int from public.mentorships), 5, 'principal reads all 5 mentorship rows');
select throws_ok(
  $$insert into public.mentorships (mentor_id, student_id, valid_from)
    values ('22222222-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000004', current_date)$$,
  '42501', null, 'principal (read-only) cannot insert a link');
reset role;

-- ---------------------------------------------------------------- student S1
select tests.as_user('11111111-0000-0000-0000-000000000001');
select is(array(select id from public.profiles where role = 'student' order by id),
  array['11111111-0000-0000-0000-000000000001']::uuid[],
  'student S1 sees only self among students');
select is(array(select mentor_id from public.mentorships),
  array['22222222-0000-0000-0000-000000000001']::uuid[],
  'student S1 reads only own mentorship row');
select is(public.current_role_of(), 'student'::public.user_role, 'current_role_of() = student for S1');
select is(public.is_active_user(), true, 'is_active_user() true for S1');

-- student cannot change own role / active (no update policy -> 0 rows touched)
update public.profiles set role = 'admin' where id = auth.uid();
update public.profiles set active = false where id = auth.uid();
update public.profiles set full_name = 'hacked' where id = auth.uid();

-- non-admin cannot write link tables
select throws_ok(
  $$insert into public.mentorships (mentor_id, student_id, valid_from)
    values ('22222222-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001', current_date)$$,
  '42501', null, 'student cannot insert a mentorship');
select throws_ok(
  $$insert into public.group_members (group_id, student_id, valid_from)
    values ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000003', current_date)$$,
  '42501', null, 'student cannot insert a group membership');
update public.mentorships set valid_to = current_date - 1
  where student_id = '11111111-0000-0000-0000-000000000001';
reset role;

select is(
  (select row(role, active, full_name)::text from public.profiles where id = '11111111-0000-0000-0000-000000000001'),
  row('student'::public.user_role, true, 's1')::text,
  'student S1 could not change own role, active or name');
select is(
  (select valid_to from public.mentorships
    where student_id = '11111111-0000-0000-0000-000000000001'
      and mentor_id = '22222222-0000-0000-0000-000000000001'),
  null::date, 'student could not end own mentorship');

-- ---------------------------------------------------------------- non-admin faculty writes
select tests.as_user('22222222-0000-0000-0000-000000000003');  -- HOD H1
select throws_ok(
  $$insert into public.department_memberships (student_id, department_id, valid_from)
    values ('11111111-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', current_date)$$,
  '42501', null, 'HOD cannot insert department memberships');
select throws_ok(
  $$insert into public.hod_assignments (faculty_id, department_id, valid_from)
    values ('22222222-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000002', current_date)$$,
  '42501', null, 'HOD cannot insert hod_assignments');
select throws_ok(
  $$insert into public.group_leads (group_id, faculty_id, valid_from)
    values ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000003', current_date)$$,
  '42501', null, 'faculty cannot insert group_leads');
select throws_ok(
  $$insert into public.student_year (student_id, year)
    values ('11111111-0000-0000-0000-000000000001', 1)$$,
  '42501', null, 'faculty cannot insert student_year');
update public.department_memberships set valid_to = current_date - 1;
update public.hod_assignments set valid_to = current_date - 1;
update public.student_year set year = 9;
update public.profiles set active = false where id = '11111111-0000-0000-0000-000000000001';
reset role;

select tests.as_user('22222222-0000-0000-0000-000000000002');  -- group lead M2
update public.group_members set valid_to = current_date - 1;
update public.group_leads set valid_to = current_date - 1;
reset role;

select is(
  (select count(*)::int from public.department_memberships where valid_to is not null)
  + (select count(*)::int from public.hod_assignments where valid_to is not null)
  + (select count(*)::int from public.student_year where year = 9)
  + (select count(*)::int from public.group_members where valid_to is not null)
  + (select count(*)::int from public.group_leads where valid_to is not null)
  + (select count(*)::int from public.profiles where not active),
  -- pre-existing: 1 ended hod_assignment, 1 removed group member, 1 inactive profile (x)
  3, 'faculty updates to link tables and profiles changed nothing');

-- ---------------------------------------------------------------- inactive user
select tests.as_user('22222222-0000-0000-0000-000000000006');
select is((select count(*)::int from public.profiles), 0, 'inactive user sees 0 profiles (not even self)');
select is((select count(*)::int from public.mentorships), 0, 'inactive user sees 0 mentorships');
select is((select count(*)::int from public.departments), 0, 'inactive user sees 0 departments');
select is(public.is_active_user(), false, 'is_active_user() false for inactive user');
select is(public.current_role_of(), null::public.user_role, 'current_role_of() null for inactive user');
reset role;

-- ---------------------------------------------------------------- admin
select tests.as_user('33333333-0000-0000-0000-000000000001');
select is((select count(*)::int from public.profiles), 13, 'admin sees all 13 accounts (account management)');
select lives_ok(
  $$insert into public.mentorships (mentor_id, student_id, valid_from)
    values ('22222222-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000004', current_date - 10)$$,
  'admin can create a mentorship link');
-- links are active through valid_to inclusive: ending access today means valid_to = current_date - 1
update public.mentorships set valid_to = current_date - 1
  where mentor_id = '22222222-0000-0000-0000-000000000005';
select throws_ok(
  $$update public.mentorships set valid_from = current_date - 50
    where mentor_id = '22222222-0000-0000-0000-000000000005'$$,
  '42501', null, 'admin cannot rewrite valid_from of a link (only valid_to is updatable)');
select throws_ok(
  $$update public.mentorships set student_id = '11111111-0000-0000-0000-000000000003'
    where mentor_id = '22222222-0000-0000-0000-000000000005'$$,
  '42501', null, 'admin cannot rewrite student_id of a link');
delete from public.mentorships where mentor_id = '22222222-0000-0000-0000-000000000005';
update public.profiles set active = false where id = '11111111-0000-0000-0000-000000000004';
select throws_ok(
  $$update public.profiles set role = 'principal' where id = '22222222-0000-0000-0000-000000000005'$$,
  '42501', null, 'admin cannot promote anyone to principal');
update public.profiles set active = false where id = '44444444-0000-0000-0000-000000000001';
-- admin cannot touch own row (escalation: admin -> faculty + self-made mentorship)
update public.profiles set role = 'faculty' where id = auth.uid();
update public.profiles set active = false where id = auth.uid();
select throws_ok(
  $$update public.profiles set role = 'admin' where id = '22222222-0000-0000-0000-000000000005'$$,
  '42501', null, 'admin cannot promote another user to admin');
update public.profiles set role = 'faculty' where id = '33333333-0000-0000-0000-000000000002';
update public.profiles set active = false where id = '33333333-0000-0000-0000-000000000002';

-- one department per student at a time
select throws_ok(
  $$insert into public.department_memberships (student_id, department_id, valid_from)
    values ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', current_date)$$,
  '23P01', null, 'overlapping department membership is rejected');
update public.department_memberships set valid_to = current_date - 1
  where student_id = '11111111-0000-0000-0000-000000000003';
select lives_ok(
  $$insert into public.department_memberships (student_id, department_id, valid_from)
    values ('11111111-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', current_date)$$,
  'successor department membership starting the day after the previous valid_to is accepted');
reset role;

select is(
  (select array_agg(row(role, active)::text order by id) from public.profiles
    where id in ('33333333-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000002')),
  array[row('admin'::public.user_role, true)::text, row('admin'::public.user_role, true)::text],
  'admin changed neither own row nor another admin''s role/active');

select ok(
  not bool_or(has_table_privilege(r, 'public.' || t, 'TRUNCATE')),
  'authenticated and anon have no TRUNCATE on any identity table')
from unnest(array['profiles','departments','student_year','department_memberships',
                  'hod_assignments','groups','group_members','group_leads','mentorships']) t,
     unnest(array['authenticated','anon']) r;

select is(
  (select valid_to from public.mentorships where mentor_id = '22222222-0000-0000-0000-000000000005'),
  current_date - 1, 'admin ended the link via valid_to = yesterday; delete removed nothing');
select is(
  (select array[(select active from public.profiles where id = '11111111-0000-0000-0000-000000000004'),
                (select active from public.profiles where id = '44444444-0000-0000-0000-000000000001')]),
  array[false, true], 'admin can deactivate a student but not the principal');

select * from finish();
rollback;
