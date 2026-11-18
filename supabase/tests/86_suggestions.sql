-- Event suggestions (0011_event_suggestions.sql): readable by staff, never by students, never writable from the app.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

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

select tests.make_user('11111111-0000-0000-0000-000000000001', 'student', 's1');
select tests.make_user('22222222-0000-0000-0000-000000000001', 'faculty', 'f1');
select tests.make_user('22222222-0000-0000-0000-000000000002', 'faculty', 'fx', false);
select tests.make_user('33333333-0000-0000-0000-000000000001', 'admin', 'admin');

insert into public.event_suggestions (kind, title, source_key) values
  ('hackathon', 'H1', 'h:1'), ('internship', 'I1', 'i:1');

select tests.as_user('22222222-0000-0000-0000-000000000001');
select is((select count(*)::int from public.event_suggestions), 2, 'active faculty read the suggestions');
select throws_ok($$insert into public.event_suggestions (kind, title, source_key) values ('hackathon', 'x', 'h:2')$$,
  '42501', null, 'faculty cannot add suggestions');
select throws_ok($$update public.event_suggestions set title = 'x'$$, '42501', null, 'faculty cannot edit suggestions');

select tests.as_user('33333333-0000-0000-0000-000000000001');
select is((select count(*)::int from public.event_suggestions), 2, 'the admin reads them too');

select tests.as_user('11111111-0000-0000-0000-000000000001');
select is((select count(*)::int from public.event_suggestions), 0, 'a student sees none');

select tests.as_user('22222222-0000-0000-0000-000000000002');
select is((select count(*)::int from public.event_suggestions), 0, 'an inactive faculty account sees none');

reset role;
select is((select count(*)::int from public.invitations), 0, 'suggestions invite nobody');
select is((select count(*)::int from public.items), 0, 'and are not events');

select * from finish();
rollback;
