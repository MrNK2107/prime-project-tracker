-- Task 8: admin operations (0006_admin_ops.sql).
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

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

-- students s1..s3 (s3 inactive), faculty m1 m2 f-inactive, admin, principal
select tests.make_user('11111111-0000-0000-0000-000000000001', 'student', 's1');
select tests.make_user('11111111-0000-0000-0000-000000000002', 'student', 's2');
select tests.make_user('11111111-0000-0000-0000-000000000003', 'student', 's3', false);
select tests.make_user('22222222-0000-0000-0000-000000000001', 'faculty', 'm1');
select tests.make_user('22222222-0000-0000-0000-000000000002', 'faculty', 'm2');
select tests.make_user('22222222-0000-0000-0000-000000000003', 'faculty', 'fx', false);
select tests.make_user('33333333-0000-0000-0000-000000000001', 'admin', 'admin');
select tests.make_user('44444444-0000-0000-0000-000000000001', 'principal', 'principal');

insert into public.departments (id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'D1'), ('aaaaaaaa-0000-0000-0000-000000000002', 'D2');
insert into public.groups (id, name) values ('bbbbbbbb-0000-0000-0000-000000000001', 'G1');

-- ------------------------------------------------ only an admin may call these (42501)
select tests.as_user('22222222-0000-0000-0000-000000000001');
select throws_ok($$select public.admin_assign_mentor('22222222-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001')$$,
  '42501', null, 'faculty cannot assign a mentor');
select tests.as_user('11111111-0000-0000-0000-000000000001');
select throws_ok($$select public.admin_promote_year(null)$$, '42501', null, 'student cannot promote years');
select tests.as_user('44444444-0000-0000-0000-000000000001');
select throws_ok($$select public.admin_move_department('11111111-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001')$$,
  '42501', null, 'principal cannot move a department');

-- ------------------------------------------------ assign mentor twice, then change mentor
select tests.as_user('33333333-0000-0000-0000-000000000001');
select lives_ok($$select public.admin_assign_mentor('22222222-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001')$$, 'admin assigns mentor');
select lives_ok($$select public.admin_assign_mentor('22222222-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001')$$, 'same mentor again is a no-op');
select is((select count(*)::int from public.mentorships where student_id = '11111111-0000-0000-0000-000000000001'), 1, 'still one link row');
select lives_ok($$select public.admin_assign_mentor('22222222-0000-0000-0000-000000000002','11111111-0000-0000-0000-000000000001')$$, 'admin changes mentor');
select is((select count(*)::int from public.mentorships where student_id = '11111111-0000-0000-0000-000000000001'
            and valid_from <= current_date and (valid_to is null or valid_to >= current_date)), 1, 'exactly one active mentorship');
select is((select mentor_id::text from public.mentorships where student_id = '11111111-0000-0000-0000-000000000001'
            and (valid_to is null or valid_to >= current_date)), '22222222-0000-0000-0000-000000000002', 'the new mentor is the active one');
select is((select count(*)::int from public.mentorships where student_id = '11111111-0000-0000-0000-000000000001' and valid_to < current_date), 1, 'the old link is ended, not deleted');
select throws_ok($$select public.admin_assign_mentor('22222222-0000-0000-0000-000000000003','11111111-0000-0000-0000-000000000002')$$,
  '22023', null, 'inactive faculty cannot be a mentor');
select throws_ok($$select public.admin_assign_mentor('22222222-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000003')$$,
  '22023', null, 'inactive student cannot be given a mentor');

-- ------------------------------------------------ groups, leads, HOD
select lives_ok($$select public.admin_add_to_group('bbbbbbbb-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001')$$, 'add to group');
select lives_ok($$select public.admin_add_to_group('bbbbbbbb-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001')$$, 'add twice is a no-op');
select is((select count(*)::int from public.group_members), 1, 'one membership row');
select lives_ok($$select public.admin_remove_from_group('bbbbbbbb-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001')$$, 'remove from group');
select is((select count(*)::int from public.group_members where valid_to is null or valid_to >= current_date), 0, 'membership ended');
select public.admin_assign_hod('22222222-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001');
select public.admin_assign_hod('22222222-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001');
select is((select faculty_id::text from public.hod_assignments where department_id = 'aaaaaaaa-0000-0000-0000-000000000001'
            and (valid_to is null or valid_to >= current_date)), '22222222-0000-0000-0000-000000000002', 'one HOD at a time, the newest');

-- ------------------------------------------------ department move and year promotion
select public.admin_move_department('11111111-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001');
select public.admin_move_department('11111111-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000002');
select public.admin_set_student_year('11111111-0000-0000-0000-000000000001', 2::smallint);
select public.admin_set_student_year('11111111-0000-0000-0000-000000000002', 2::smallint);
select throws_ok($$select public.admin_move_department('11111111-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000002')$$,
  'P0001', null, 'a second placement on the same day is refused, not silently broken');
select is(public.admin_promote_year('aaaaaaaa-0000-0000-0000-000000000001'), 1, 'promoting D1 updates one student');
select is((select string_agg(year::text, ',' order by student_id) from public.student_year), '3,2', 'only the D1 student moved up');

select * from finish();
rollback;
