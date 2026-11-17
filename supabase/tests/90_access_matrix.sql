-- Task 12: cross-role access matrix.
--
-- One shared fixture; for each role the EXACT number of rows visible in every table, and a check
-- that every direct write (outside the app's security-definer functions) is refused.
-- An expected number that is wrong in either direction is a failing test: too many means a leak,
-- too few means a role lost access it needs.
--
-- Fixture (all links active, valid_from 2020-01-01):
--   students  s1 (D1, G1, mentor m1 and inactive x)   s2 (D1, G1, mentor m2)
--             s3 (D2, mentor m2)                       s4 (D1, no group, no mentor)
--   faculty   m1 mentor of s1 | m2 mentor of s2, s3 | gl lead of G1 | h1 HOD of D1
--             f0 no links     | x INACTIVE, mentorship of s1
--   admin a, principal p
--   item1 (by m1) invites s1, s2;  item2 (by m2) invites s3
--   results: r1 on s1/item1 confirmed, r2 on s2/item1 submitted, r3 on s3/item2 submitted
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

create schema tests;
grant usage on schema tests to authenticated;

create function tests.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create function tests.make_user(uid uuid, r public.user_role, name text, is_active boolean default true)
returns void language plpgsql as $$
begin
  insert into auth.users (id, email, aud, role) values (uid, name || '@test.local', 'authenticated', 'authenticated');
  insert into public.profiles (id, email, full_name, role, active) values (uid, name || '@test.local', name, r, is_active);
end $$;

-- Row counts of every table as the current user (0 when the table is not readable at all).
create function tests.counts() returns jsonb language plpgsql as $$
declare
  t text;
  n bigint;
  out jsonb := '{}';
begin
  foreach t in array array['profiles','departments','groups','hod_assignments','group_leads','student_year',
                           'department_memberships','group_members','mentorships','items','invitations','results']
  loop
    execute format('select count(*) from public.%I', t) into n;
    out := out || jsonb_build_object(t, n);
  end loop;
  begin
    select count(*) into n from public.audit_log;
  exception when insufficient_privilege then n := 0;
  end;
  return out || jsonb_build_object('audit_log_readable', n > 0);
end $$;

-- True when EVERY direct write below is refused (privilege error or row-level-security violation,
-- or silently affects zero rows for updates that RLS filters out).
create function tests.all_writes_denied() returns boolean language plpgsql as $$
declare
  stmt text;
  n bigint;
  denied boolean := true;
begin
  foreach stmt in array array[
    $q$insert into public.items (type, title, created_by) values ('event', 'x', '22222222-0000-0000-0000-000000000001')$q$,
    $q$insert into public.invitations (item_id, student_id) values ('c0000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000004')$q$,
    $q$insert into public.results (invitation_id, revision, outcome) values ('d0000000-0000-0000-0000-000000000001', 9, 'forged')$q$,
    $q$update public.results set outcome = 'edited'$q$,
    $q$delete from public.results$q$,
    $q$update public.items set title = 'edited'$q$,
    $q$delete from public.items$q$,
    $q$update public.invitations set status = 'joined'$q$,
    $q$delete from public.profiles$q$,
    $q$insert into public.audit_log (action, entity, entity_id) values ('forged', 'x', 'y')$q$,
    $q$delete from public.audit_log$q$
  ] loop
    begin
      execute stmt;
      get diagnostics n = row_count;
      if n > 0 then denied := false; end if;
    exception when others then
      -- A refusal is what we want. A syntax or name error would be a broken test, not a refusal.
      if sqlstate in ('42601', '42703', '42P01', '42883', '42804', '22P02') then
        raise exception 'broken test statement: % (%)', stmt, sqlerrm;
      end if;
    end;
  end loop;
  return denied;
end $$;

grant execute on all functions in schema tests to authenticated;

-- ---------------------------------------------------------------- fixture
select tests.make_user('11111111-0000-0000-0000-000000000001', 'student', 's1');
select tests.make_user('11111111-0000-0000-0000-000000000002', 'student', 's2');
select tests.make_user('11111111-0000-0000-0000-000000000003', 'student', 's3');
select tests.make_user('11111111-0000-0000-0000-000000000004', 'student', 's4');
select tests.make_user('22222222-0000-0000-0000-000000000001', 'faculty', 'm1');
select tests.make_user('22222222-0000-0000-0000-000000000002', 'faculty', 'm2');
select tests.make_user('22222222-0000-0000-0000-000000000003', 'faculty', 'gl');
select tests.make_user('22222222-0000-0000-0000-000000000004', 'faculty', 'h1');
select tests.make_user('22222222-0000-0000-0000-000000000005', 'faculty', 'f0');
select tests.make_user('22222222-0000-0000-0000-000000000006', 'faculty', 'x', false);
select tests.make_user('33333333-0000-0000-0000-000000000001', 'admin', 'a');
select tests.make_user('44444444-0000-0000-0000-000000000001', 'principal', 'p');

insert into public.departments (id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'D1'), ('aaaaaaaa-0000-0000-0000-000000000002', 'D2');
insert into public.groups (id, name) values ('bbbbbbbb-0000-0000-0000-000000000001', 'G1');
insert into public.student_year (student_id, year) values
  ('11111111-0000-0000-0000-000000000001', 2), ('11111111-0000-0000-0000-000000000002', 2),
  ('11111111-0000-0000-0000-000000000003', 3), ('11111111-0000-0000-0000-000000000004', 1);
insert into public.department_memberships (student_id, department_id, valid_from) values
  ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '2020-01-01'),
  ('11111111-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', '2020-01-01'),
  ('11111111-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000002', '2020-01-01'),
  ('11111111-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', '2020-01-01');
insert into public.hod_assignments (faculty_id, department_id, valid_from) values
  ('22222222-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', '2020-01-01');
insert into public.group_members (group_id, student_id, valid_from) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', '2020-01-01'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002', '2020-01-01');
insert into public.group_leads (group_id, faculty_id, valid_from) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000003', '2020-01-01');
insert into public.mentorships (mentor_id, student_id, valid_from) values
  ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', '2020-01-01'),
  ('22222222-0000-0000-0000-000000000006', '11111111-0000-0000-0000-000000000001', '2020-01-01'),
  ('22222222-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000002', '2020-01-01'),
  ('22222222-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000003', '2020-01-01');
insert into public.items (id, type, title, created_by) values
  ('c0000000-0000-0000-0000-000000000001', 'hackathon', 'item1', '22222222-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000002', 'internship', 'item2', '22222222-0000-0000-0000-000000000002');
insert into public.invitations (id, item_id, student_id, status) values
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'joined'),
  ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002', 'joined'),
  ('d0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000003', 'joined');
insert into public.results (invitation_id, revision, outcome, status, confirmed_by, confirmed_at) values
  ('d0000000-0000-0000-0000-000000000001', 1, 'r1', 'confirmed', '22222222-0000-0000-0000-000000000001', now());
insert into public.results (invitation_id, revision, outcome, status) values
  ('d0000000-0000-0000-0000-000000000002', 1, 'r2', 'submitted'),
  ('d0000000-0000-0000-0000-000000000003', 1, 'r3', 'submitted');

-- ---------------------------------------------------------------- the matrix
-- Columns: profiles departments groups hod_assignments group_leads student_year dept_memberships
--          group_members mentorships items invitations results audit_log_readable
-- profiles = 8 faculty/admin/principal profiles (visible to every active user) + visible students.

select tests.as_user('11111111-0000-0000-0000-000000000001');   -- s1: sees only themself
select is(tests.counts(),
  '{"profiles":9,"departments":2,"groups":1,"hod_assignments":1,"group_leads":1,"student_year":1,"department_memberships":1,"group_members":1,"mentorships":2,"items":1,"invitations":1,"results":1,"audit_log_readable":false}'::jsonb,
  'student s1: own rows only');
select ok(tests.all_writes_denied(), 'student s1: every direct write refused');

select tests.as_user('22222222-0000-0000-0000-000000000001');   -- m1: mentor of s1
select is(tests.counts(),
  '{"profiles":9,"departments":2,"groups":1,"hod_assignments":1,"group_leads":1,"student_year":1,"department_memberships":1,"group_members":1,"mentorships":2,"items":1,"invitations":2,"results":2,"audit_log_readable":false}'::jsonb,
  'mentor m1: s1, plus the item they created');
select ok(tests.all_writes_denied(), 'mentor m1: every direct write refused');

select tests.as_user('22222222-0000-0000-0000-000000000002');   -- m2: mentor of s2, s3
select is(tests.counts(),
  '{"profiles":10,"departments":2,"groups":1,"hod_assignments":1,"group_leads":1,"student_year":2,"department_memberships":2,"group_members":1,"mentorships":2,"items":2,"invitations":2,"results":2,"audit_log_readable":false}'::jsonb,
  'mentor m2: s2 and s3');
select ok(tests.all_writes_denied(), 'mentor m2: every direct write refused');

select tests.as_user('22222222-0000-0000-0000-000000000003');   -- gl: lead of G1 (s1, s2)
select is(tests.counts(),
  '{"profiles":10,"departments":2,"groups":1,"hod_assignments":1,"group_leads":1,"student_year":2,"department_memberships":2,"group_members":2,"mentorships":3,"items":1,"invitations":2,"results":2,"audit_log_readable":false}'::jsonb,
  'group lead gl: members of G1');
select ok(tests.all_writes_denied(), 'group lead gl: every direct write refused');

select tests.as_user('22222222-0000-0000-0000-000000000004');   -- h1: HOD of D1 (s1, s2, s4)
select is(tests.counts(),
  '{"profiles":11,"departments":2,"groups":1,"hod_assignments":1,"group_leads":1,"student_year":3,"department_memberships":3,"group_members":2,"mentorships":3,"items":1,"invitations":2,"results":2,"audit_log_readable":false}'::jsonb,
  'HOD h1: department D1 only');
select ok(tests.all_writes_denied(), 'HOD h1: every direct write refused');

select tests.as_user('22222222-0000-0000-0000-000000000005');   -- f0: faculty with no links
select is(tests.counts(),
  '{"profiles":8,"departments":2,"groups":1,"hod_assignments":1,"group_leads":1,"student_year":0,"department_memberships":0,"group_members":0,"mentorships":0,"items":0,"invitations":0,"results":0,"audit_log_readable":false}'::jsonb,
  'faculty with no links: no students, empty not an error');
select ok(tests.all_writes_denied(), 'faculty with no links: every direct write refused');

select tests.as_user('22222222-0000-0000-0000-000000000006');   -- x: INACTIVE faculty with a live mentorship
select is(tests.counts(),
  '{"profiles":0,"departments":0,"groups":0,"hod_assignments":0,"group_leads":0,"student_year":0,"department_memberships":0,"group_members":0,"mentorships":0,"items":0,"invitations":0,"results":0,"audit_log_readable":false}'::jsonb,
  'inactive user with a still-valid session: every table empty');
select ok(tests.all_writes_denied(), 'inactive user: every direct write refused');

select tests.as_user('33333333-0000-0000-0000-000000000001');   -- admin: reads everything, manages accounts and links
select is(tests.counts(),
  '{"profiles":12,"departments":2,"groups":1,"hod_assignments":1,"group_leads":1,"student_year":4,"department_memberships":4,"group_members":2,"mentorships":4,"items":2,"invitations":3,"results":3,"audit_log_readable":true}'::jsonb,
  'admin: reads everything');
select ok(tests.all_writes_denied(), 'admin: no direct writes to items, invitations, results, audit log (admin reads everything but cannot forge records)');

select tests.as_user('44444444-0000-0000-0000-000000000001');   -- principal: everything, read-only
select is(tests.counts(),
  '{"profiles":12,"departments":2,"groups":1,"hod_assignments":1,"group_leads":1,"student_year":4,"department_memberships":4,"group_members":2,"mentorships":4,"items":2,"invitations":3,"results":3,"audit_log_readable":true}'::jsonb,
  'principal: sees everything');
select ok(tests.all_writes_denied(), 'principal: read-only, every direct write refused');

-- ---------------------------------------------------------------- the people who must NOT see a result
-- (named checks of the anti-goals, independent of the counts above)
select tests.as_user('22222222-0000-0000-0000-000000000001');
select is((select count(*)::int from public.results where outcome = 'r3'), 0, 'mentor m1 cannot read s3''s result');
select tests.as_user('11111111-0000-0000-0000-000000000002');
select is((select count(*)::int from public.results where outcome = 'r1'), 0, 'student s2 cannot read s1''s result');
select tests.as_user('22222222-0000-0000-0000-000000000004');
select is((select count(*)::int from public.results where outcome = 'r3'), 0, 'HOD of D1 cannot read a D2 student''s result');

-- ---------------------------------------------------------------- anonymous
reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;
select throws_ok($$select * from public.profiles$$, '42501', null, 'anon cannot read profiles');
select throws_ok($$select * from public.results$$, '42501', null, 'anon cannot read results');
select throws_ok($$select * from public.items$$, '42501', null, 'anon cannot read items');
select throws_ok($$select * from public.audit_log$$, '42501', null, 'anon cannot read the audit log');
reset role;

-- ---------------------------------------------------------------- nothing slipped in during the writes
select is((select count(*)::int from public.results), 3, 'no result was created, changed or removed by the write attempts');
select is((select count(*)::int from public.items), 2, 'no item was created or removed by the write attempts');

select * from finish();
rollback;
