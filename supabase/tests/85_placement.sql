-- Hackathon and placement coordinator (0010_placement_coordinator.sql).
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

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
grant execute on all functions in schema tests to authenticated;

-- students s1 s2 s3; faculty pc (placement coordinator), pl (plain faculty, mentors s1), mentor of s2 is none
select tests.make_user('11111111-0000-0000-0000-000000000001', 'student', 's1');
select tests.make_user('11111111-0000-0000-0000-000000000002', 'student', 's2');
select tests.make_user('11111111-0000-0000-0000-000000000003', 'student', 's3');
select tests.make_user('22222222-0000-0000-0000-000000000001', 'faculty', 'pc');
select tests.make_user('22222222-0000-0000-0000-000000000002', 'faculty', 'pl');
select tests.make_user('33333333-0000-0000-0000-000000000001', 'admin', 'admin');
insert into public.mentorships (mentor_id, student_id, valid_from) values
  ('22222222-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', current_date - 5);

-- ------------------------------------------------ only an admin grants it
select tests.as_user('22222222-0000-0000-0000-000000000002');
select throws_ok($$select public.admin_assign_placement_coordinator('22222222-0000-0000-0000-000000000002')$$,
  '42501', null, 'faculty cannot grant the role');
select tests.as_user('33333333-0000-0000-0000-000000000001');
select lives_ok($$select public.admin_assign_placement_coordinator('22222222-0000-0000-0000-000000000001')$$, 'admin grants it');
select lives_ok($$select public.admin_assign_placement_coordinator('22222222-0000-0000-0000-000000000001')$$, 'granting twice is a no-op');
select is((select count(*)::int from public.placement_coordinators), 1, 'one active link row');

-- ------------------------------------------------ what it sees
select tests.as_user('22222222-0000-0000-0000-000000000001');
select is((select count(*)::int from public.visible_student_ids()), 4, 'the coordinator sees every student (and themself)');
select ok(public.can_see_student('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000003'), 'can_see_student agrees');
select is((select count(*)::int from public.profiles where role = 'student'), 3, 'and can read their profiles');
select tests.as_user('22222222-0000-0000-0000-000000000002');
select is((select count(*)::int from public.visible_student_ids()), 2, 'plain faculty still sees only their mentee (and themself)');

-- ------------------------------------------------ what it can post
select tests.as_user('22222222-0000-0000-0000-000000000001');
select lives_ok($$select public.create_item('{"type":"hackathon","title":"Open to all"}'::jsonb, '{}', '{}', '{}',
  array['11111111-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000002','11111111-0000-0000-0000-000000000003']::uuid[])$$,
  'the coordinator posts an event to students from any group or department');
select is((select count(*)::int from public.invitations), 3, 'all three were invited');
select tests.as_user('22222222-0000-0000-0000-000000000002');
select is((select count(*)::int from public.invitations), 1, 'the mentor still sees only their own student on it');

-- ------------------------------------------------ no extra authority
select tests.as_user('22222222-0000-0000-0000-000000000001');
select is((select count(*)::int from public.results), 0, 'no results exist, nothing to confirm yet');

-- ------------------------------------------------ ending the role
select tests.as_user('33333333-0000-0000-0000-000000000001');
select lives_ok($$select public.admin_remove_placement_coordinator('22222222-0000-0000-0000-000000000001')$$, 'admin ends it');
select tests.as_user('22222222-0000-0000-0000-000000000001');
select is((select count(*)::int from public.visible_student_ids()), 1, 'afterwards the person sees only themself');

select * from finish();
rollback;
