-- Task 11: dashboard views (0007_dashboards.sql).
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

-- s1 (dept D1), s2 (dept D2); h1 = HOD of D1; m = faculty with no links who created the items;
-- admin, principal.
select tests.make_user('11111111-0000-0000-0000-000000000001', 'student', 's1');
select tests.make_user('11111111-0000-0000-0000-000000000002', 'student', 's2');
select tests.make_user('22222222-0000-0000-0000-000000000001', 'faculty', 'h1');
select tests.make_user('22222222-0000-0000-0000-000000000002', 'faculty', 'm');
select tests.make_user('33333333-0000-0000-0000-000000000001', 'admin', 'admin');
select tests.make_user('44444444-0000-0000-0000-000000000001', 'principal', 'principal');

insert into public.departments (id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'D1'), ('aaaaaaaa-0000-0000-0000-000000000002', 'D2');
insert into public.department_memberships (student_id, department_id, valid_from) values
  ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '2020-01-01'),
  ('11111111-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002', '2020-01-01');
insert into public.hod_assignments (faculty_id, department_id, valid_from) values
  ('22222222-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '2020-01-01');

insert into public.items (id, type, title, created_by) values
  ('c0000000-0000-0000-0000-000000000001', 'hackathon', 'H', '22222222-0000-0000-0000-000000000002'),
  ('c0000000-0000-0000-0000-000000000002', 'internship', 'I', '22222222-0000-0000-0000-000000000002');

insert into public.invitations (id, item_id, student_id, status) values
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'joined'),
  ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'joined'),
  ('d0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002', 'joined');

-- s1 hackathon: confirmed revision 1 plus a pending correction (revision 2)
insert into public.results (invitation_id, revision, outcome, status, confirmed_by, confirmed_at) values
  ('d0000000-0000-0000-0000-000000000001', 1, 'Won', 'confirmed', '22222222-0000-0000-0000-000000000002', now());
insert into public.results (invitation_id, revision, outcome, status) values
  ('d0000000-0000-0000-0000-000000000001', 2, 'Won first prize', 'submitted');
-- s1 internship: only a submitted claim
insert into public.results (invitation_id, revision, outcome, status) values
  ('d0000000-0000-0000-0000-000000000002', 1, 'Selected', 'submitted');
-- s2 hackathon: confirmed (other department)
insert into public.results (invitation_id, revision, outcome, status, confirmed_by, confirmed_at) values
  ('d0000000-0000-0000-0000-000000000003', 1, 'Finalist', 'confirmed', '22222222-0000-0000-0000-000000000002', now());

-- ---------------------------------------------------------------- head of department
select tests.as_user('22222222-0000-0000-0000-000000000001');
select is((select count(*)::int from public.confirmed_results_by_student), 1, 'HOD sees one confirmed row (own department only)');
select is((select student_id::text from public.confirmed_results_by_student), '11111111-0000-0000-0000-000000000001', 'and it is the D1 student');
select is((select count from public.confirmed_results_by_student where item_type = 'hackathon'), 1::bigint,
  'a pending correction does not change the confirmed count, and it counts once');
select is((select count(*)::int from public.unconfirmed_claims_by_student), 1, 'HOD sees one claim row');
select is((select item_type::text from public.unconfirmed_claims_by_student), 'internship',
  'the claim is the never-confirmed internship, not the correction on the confirmed hackathon');

-- ---------------------------------------------------------------- principal
select tests.as_user('44444444-0000-0000-0000-000000000001');
select is((select count(*)::int from public.confirmed_results_by_student), 2, 'principal sees confirmed rows for both departments');
select is((select count(*)::int from public.unconfirmed_claims_by_student), 1, 'principal sees the one claim');

-- ---------------------------------------------------------------- a student sees only themself
select tests.as_user('11111111-0000-0000-0000-000000000002');
select is((select count(*)::int from public.confirmed_results_by_student), 1, 'a student sees only their own confirmed row');
select is((select count(*)::int from public.unconfirmed_claims_by_student), 0, 'and no one else''s claims');

-- ---------------------------------------------------------------- admin, unrelated faculty, anonymous
select tests.as_user('33333333-0000-0000-0000-000000000001');
select is((select count(*)::int from public.confirmed_results_by_student), 0, 'admin sees no results');
select is((select count(*)::int from public.unconfirmed_claims_by_student), 0, 'admin sees no claims');

reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;
select throws_ok($$select * from public.confirmed_results_by_student$$, '42501', null, 'anon cannot read the confirmed view');
select throws_ok($$select * from public.unconfirmed_claims_by_student$$, '42501', null, 'anon cannot read the claims view');

-- confirming the correction replaces the value; the confirmed count stays one per invitation
reset role;
select is((select count(*)::int from public.results where invitation_id = 'd0000000-0000-0000-0000-000000000001' and status = 'confirmed'), 1,
  'one confirmed row per invitation');

select * from finish();
rollback;
