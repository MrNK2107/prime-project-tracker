-- LOCAL DEVELOPMENT SEED. Load with `npm run seed:local` (not automatic: the pgTAP tests need empty tables).
-- Never run against a hosted project.
--
-- Sign in locally with an emailed code (read it at http://127.0.0.1:54324):
--   admin@college.edu, principal@college.edu, faculty@college.edu, student@college.edu, student2@college.edu
-- Production: the single principal account and the first admin are created by hand at deploy time
-- (Task 12), with the real college email addresses. Do not put real addresses in this file.

do $$
declare
  rec record;
begin
  for rec in
    select * from (values
      ('5eed0003-0000-0000-0000-000000000001'::uuid, 'admin@college.edu',     'Dr. Kavitha Rao',    'admin'::public.user_role),
      ('5eed0004-0000-0000-0000-000000000001'::uuid, 'principal@college.edu', 'Dr. S. Venkatesan',  'principal'::public.user_role),
      ('5eed0002-0000-0000-0000-000000000001'::uuid, 'faculty@college.edu',   'Dr. Meena Iyer',     'faculty'::public.user_role),
      ('5eed0001-0000-0000-0000-000000000001'::uuid, 'student@college.edu',   'Asha Raman',         'student'::public.user_role),
      ('5eed0001-0000-0000-0000-000000000002'::uuid, 'student2@college.edu',  'Karthik Subramanian','student'::public.user_role)
    ) as t(id, email, full_name, role)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', rec.id, 'authenticated', 'authenticated', rec.email, now(), now(), now(),
      '{"provider":"email","providers":["email"]}', '{}', false, false, '', '', '', ''
    );
    insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), rec.id, rec.id::text, 'email',
            json_build_object('sub', rec.id::text, 'email', rec.email)::jsonb, now(), now(), now());
    insert into public.profiles (id, email, full_name, role) values (rec.id, rec.email, rec.full_name, rec.role);
  end loop;
end $$;

insert into public.departments (id, name) values
  ('5eedaaaa-0000-0000-0000-000000000001', 'Computer Science and Engineering'),
  ('5eedaaaa-0000-0000-0000-000000000002', 'Electronics and Communication Engineering');
insert into public.groups (id, name) values ('5eedbbbb-0000-0000-0000-000000000001', 'Prime Project Team');
