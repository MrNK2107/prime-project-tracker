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
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', rec.id, 'authenticated', 'authenticated', rec.email, extensions.crypt('Demo@1234', extensions.gen_salt('bf')), now(), now(), now(),
      '{"provider":"email","providers":["email"]}', '{}', false, false, '', '', '', ''
    );
    insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), rec.id, rec.id::text, 'email',
            json_build_object('sub', rec.id::text, 'email', rec.email)::jsonb, now(), now(), now());
    insert into public.profiles (id, email, full_name, role, register_no)
    values (rec.id, rec.email, rec.full_name, rec.role,
            case rec.email when 'student@college.edu' then '192110001' when 'student2@college.edu' then '192110002' end);
  end loop;
end $$;

insert into public.departments (id, name) values
  ('5eedaaaa-0000-0000-0000-000000000001', 'Computer Science and Engineering'),
  ('5eedaaaa-0000-0000-0000-000000000002', 'Electronics and Communication Engineering');
insert into public.groups (id, name) values ('5eedbbbb-0000-0000-0000-000000000001', 'Prime Project Team');

-- ------------------------------------------------------------------ demo links, items and results
-- Dr. Meena Iyer (faculty@college.edu) mentors both students, leads the group and heads CSE.
insert into public.student_year (student_id, year) values
  ('5eed0001-0000-0000-0000-000000000001', 2), ('5eed0001-0000-0000-0000-000000000002', 3);
insert into public.department_memberships (student_id, department_id, valid_from) values
  ('5eed0001-0000-0000-0000-000000000001', '5eedaaaa-0000-0000-0000-000000000001', '2024-06-01'),
  ('5eed0001-0000-0000-0000-000000000002', '5eedaaaa-0000-0000-0000-000000000002', '2023-06-01');
insert into public.hod_assignments (faculty_id, department_id, valid_from) values
  ('5eed0002-0000-0000-0000-000000000001', '5eedaaaa-0000-0000-0000-000000000001', '2024-06-01');
insert into public.mentorships (mentor_id, student_id, valid_from) values
  ('5eed0002-0000-0000-0000-000000000001', '5eed0001-0000-0000-0000-000000000001', '2024-06-01'),
  ('5eed0002-0000-0000-0000-000000000001', '5eed0001-0000-0000-0000-000000000002', '2023-06-01');
insert into public.group_members (group_id, student_id, valid_from) values
  ('5eedbbbb-0000-0000-0000-000000000001', '5eed0001-0000-0000-0000-000000000001', '2024-06-01'),
  ('5eedbbbb-0000-0000-0000-000000000001', '5eed0001-0000-0000-0000-000000000002', '2024-06-01');
insert into public.group_leads (group_id, faculty_id, valid_from) values
  ('5eedbbbb-0000-0000-0000-000000000001', '5eed0002-0000-0000-0000-000000000001', '2024-06-01');

insert into public.items (id, type, title, description, meeting_url, deadline, requires_confirmation, requires_proof, created_by) values
  ('5eedc000-0000-0000-0000-000000000001', 'hackathon', 'Smart India Hackathon 2026',
   'National round. Tell us how your team placed and attach your certificate.', null, now() + interval '30 days', true, true, '5eed0002-0000-0000-0000-000000000001'),
  ('5eedc000-0000-0000-0000-000000000002', 'event', 'Google Cloud Study Jam',
   'Free two-hour hands-on session on Saturday.', 'https://meet.google.com/abc-defg-hij', now() + interval '10 days', false, false, '5eed0002-0000-0000-0000-000000000001'),
  ('5eedc000-0000-0000-0000-000000000003', 'internship', 'Zoho summer internship drive',
   'Campus drive for second-year students.', null, now() + interval '20 days', true, false, '5eed0002-0000-0000-0000-000000000001');

insert into public.invitations (id, item_id, student_id, status, responded_at) values
  ('5eedd000-0000-0000-0000-000000000001', '5eedc000-0000-0000-0000-000000000001', '5eed0001-0000-0000-0000-000000000001', 'joined', now()),
  ('5eedd000-0000-0000-0000-000000000002', '5eedc000-0000-0000-0000-000000000001', '5eed0001-0000-0000-0000-000000000002', 'joined', now()),
  ('5eedd000-0000-0000-0000-000000000003', '5eedc000-0000-0000-0000-000000000002', '5eed0001-0000-0000-0000-000000000001', 'invited', null),
  ('5eedd000-0000-0000-0000-000000000004', '5eedc000-0000-0000-0000-000000000002', '5eed0001-0000-0000-0000-000000000002', 'invited', null),
  ('5eedd000-0000-0000-0000-000000000005', '5eedc000-0000-0000-0000-000000000003', '5eed0001-0000-0000-0000-000000000001', 'declined', now());

-- Asha: a confirmed result. Karthik: a claim still waiting for review.
insert into public.results (invitation_id, revision, outcome, details, status, confirmed_by, confirmed_at) values
  ('5eedd000-0000-0000-0000-000000000001', 1, 'Finalist, national round', 'Team of four; built a flood-alert dashboard.', 'confirmed', '5eed0002-0000-0000-0000-000000000001', now());
insert into public.results (invitation_id, revision, outcome, details, status) values
  ('5eedd000-0000-0000-0000-000000000002', 1, 'Participated in the national round', 'Certificate arrives next week.', 'submitted');
