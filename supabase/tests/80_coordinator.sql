-- Group coordinator (0009_coordinator.sql): confirm any result in the group, edit any event reaching it.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

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

-- students s1 s2 (in group G), s3 (not in G); faculty: co = coordinator of G, gl = ordinary lead of G,
-- cr = creator of every event (mentors s1, s2, s3), other = no links; admin
select tests.make_user('11111111-0000-0000-0000-000000000001', 'student', 's1');
select tests.make_user('11111111-0000-0000-0000-000000000002', 'student', 's2');
select tests.make_user('11111111-0000-0000-0000-000000000003', 'student', 's3');
select tests.make_user('22222222-0000-0000-0000-000000000001', 'faculty', 'co');
select tests.make_user('22222222-0000-0000-0000-000000000002', 'faculty', 'gl');
select tests.make_user('22222222-0000-0000-0000-000000000003', 'faculty', 'cr');
select tests.make_user('22222222-0000-0000-0000-000000000004', 'faculty', 'other');
select tests.make_user('33333333-0000-0000-0000-000000000001', 'admin', 'admin');

insert into public.groups (id, name) values ('bbbbbbbb-0000-0000-0000-000000000001', 'G');
insert into public.group_members (group_id, student_id, valid_from) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', current_date - 10),
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002', current_date - 10);
insert into public.group_leads (group_id, faculty_id, valid_from, is_coordinator) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', current_date - 10, true),
  ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', current_date - 10, false);
insert into public.mentorships (mentor_id, student_id, valid_from) values
  ('22222222-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001', current_date - 10),
  ('22222222-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000002', current_date - 10),
  ('22222222-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000003', current_date - 10);

insert into public.items (id, type, title, requires_confirmation, created_by) values
  ('cccccccc-0000-0000-0000-000000000001', 'hackathon', 'E1', true, '22222222-0000-0000-0000-000000000003'),
  ('cccccccc-0000-0000-0000-000000000002', 'hackathon', 'E2', true, '22222222-0000-0000-0000-000000000003');
insert into public.invitations (id, item_id, student_id, status, responded_at) values
  ('dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'joined', now()),
  ('dddddddd-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002', 'joined', now()),
  ('dddddddd-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000003', 'joined', now());

-- s1, s2 (group) and s3 (outside the group) each submit a result.
select tests.as_user('11111111-0000-0000-0000-000000000001');
select public.submit_result('dddddddd-0000-0000-0000-000000000001', 'won', null, null);
select tests.as_user('11111111-0000-0000-0000-000000000002');
select public.submit_result('dddddddd-0000-0000-0000-000000000002', 'placed', null, null);
select tests.as_user('11111111-0000-0000-0000-000000000003');
select public.submit_result('dddddddd-0000-0000-0000-000000000003', 'entered', null, null);

-- ------------------------------------------------ structure
select ok(has_function_privilege('authenticated', 'public.coordinates_student(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.coordinates_student(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.update_item(uuid, jsonb)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.update_item(uuid, jsonb)', 'EXECUTE'),
  'coordinator functions: authenticated only');

-- ------------------------------------------------ who may confirm
select tests.as_user('22222222-0000-0000-0000-000000000002');
select throws_ok($$select public.review_result((select id from public.results where invitation_id = 'dddddddd-0000-0000-0000-000000000001'), 'confirm', null)$$,
  '42501', null, 'an ordinary group lead cannot confirm');
select tests.as_user('22222222-0000-0000-0000-000000000004');
select throws_ok($$select public.review_result((select id from public.results where invitation_id = 'dddddddd-0000-0000-0000-000000000001'), 'confirm', null)$$,
  '42501', null, 'faculty with no links cannot confirm');
select tests.as_user('33333333-0000-0000-0000-000000000001');
select throws_ok($$select public.review_result((select id from public.results where invitation_id = 'dddddddd-0000-0000-0000-000000000001'), 'confirm', null)$$,
  '42501', null, 'admin cannot confirm');

select tests.as_user('22222222-0000-0000-0000-000000000001');
select lives_ok($$select public.review_result((select id from public.results where invitation_id = 'dddddddd-0000-0000-0000-000000000001'), 'confirm', null)$$,
  'the coordinator confirms a result in the group, though someone else posted the event');
select lives_ok($$select public.review_result((select id from public.results where invitation_id = 'dddddddd-0000-0000-0000-000000000002'), 'send_back', 'add proof')$$,
  'the coordinator sends a group result back');
select throws_ok($$select public.review_result((select id from public.results where invitation_id = 'dddddddd-0000-0000-0000-000000000003'), 'confirm', null)$$,
  '42501', null, 'the coordinator has no authority over a student outside the group');

select tests.as_user('22222222-0000-0000-0000-000000000003');
select lives_ok($$select public.review_result((select id from public.results where invitation_id = 'dddddddd-0000-0000-0000-000000000003'), 'confirm', null)$$,
  'the event creator (here also the mentor) still confirms as before');

-- ------------------------------------------------ who may edit an event
select tests.as_user('22222222-0000-0000-0000-000000000002');
select throws_ok($$select public.update_item('cccccccc-0000-0000-0000-000000000001', '{"title":"x"}'::jsonb)$$,
  '42501', null, 'an ordinary group lead cannot edit an event they did not post');
select tests.as_user('22222222-0000-0000-0000-000000000004');
select throws_ok($$select public.update_item('cccccccc-0000-0000-0000-000000000001', '{"title":"x"}'::jsonb)$$,
  '42501', null, 'faculty with no links cannot edit');

select tests.as_user('22222222-0000-0000-0000-000000000001');
select lives_ok($$select public.update_item('cccccccc-0000-0000-0000-000000000001', '{"title":"E1 renamed","deadline":"2030-01-01T10:00:00+05:30"}'::jsonb)$$,
  'the coordinator edits an event that reaches the group');
select throws_ok($$select public.update_item('cccccccc-0000-0000-0000-000000000002', '{"title":"x"}'::jsonb)$$,
  '42501', null, 'the coordinator cannot edit an event that only invites students outside the group');
select throws_ok($$select public.update_item('cccccccc-0000-0000-0000-000000000001', '{"title":"  "}'::jsonb)$$,
  '22023', null, 'a blank title is refused');

select tests.as_user('22222222-0000-0000-0000-000000000003');
select lives_ok($$select public.update_item('cccccccc-0000-0000-0000-000000000002', '{"description":"new text"}'::jsonb)$$,
  'the creator edits their own event');

select tests.as_user('22222222-0000-0000-0000-000000000001');
select is((select title from public.items where id = 'cccccccc-0000-0000-0000-000000000001'), 'E1 renamed', 'the title changed');
select is((select requires_confirmation from public.items where id = 'cccccccc-0000-0000-0000-000000000001'), true,
  'what the event requires is untouched');

-- ------------------------------------------------ admin assigns a coordinator
select tests.as_user('33333333-0000-0000-0000-000000000001');
select lives_ok($$select public.admin_assign_group_lead('bbbbbbbb-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', true)$$,
  'admin promotes an ordinary lead to coordinator');

select * from finish();
rollback;
