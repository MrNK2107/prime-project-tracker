-- LOCAL DEVELOPMENT SEED. Load with `npm run seed:local` (not automatic: the pgTAP tests need empty tables).
-- Never run against a hosted project.
--
-- Sign in locally with an emailed code (read it at http://127.0.0.1:54324):
--   admin@, principal@, faculty@ (mentor), grouplead@, hod@, student@, student2@, student3@college.edu (password Demo@1234)
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
      ('5eed0005-0000-0000-0000-000000000001'::uuid, 'grouplead@college.edu', 'Dr. Priya Nair',     'faculty'::public.user_role),
      ('5eed0006-0000-0000-0000-000000000001'::uuid, 'hod@college.edu',       'Dr. Ramesh Kumar',   'faculty'::public.user_role),
      ('5eed0001-0000-0000-0000-000000000002'::uuid, 'student2@college.edu',  'Karthik Subramanian','student'::public.user_role),
      ('5eed0001-0000-0000-0000-000000000003'::uuid, 'student3@college.edu',  'Divya Menon',        'student'::public.user_role)
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
            case rec.email when 'student@college.edu' then '192110001' when 'student2@college.edu' then '192110002' when 'student3@college.edu' then '192110003' end);
  end loop;
end $$;

insert into public.departments (id, name) values
  ('5eedaaaa-0000-0000-0000-000000000001', 'Computer Science and Engineering'),
  ('5eedaaaa-0000-0000-0000-000000000002', 'Electronics and Communication Engineering');
insert into public.groups (id, name) values ('5eedbbbb-0000-0000-0000-000000000001', 'Prime Project Team');

-- ------------------------------------------------------------------ demo links, events and results
-- Three faculty, three separate capacities (nobody holds more than one in the demo):
--   Dr. Meena Iyer   (faculty@)    mentors Asha and Karthik only.
--   Dr. Priya Nair   (grouplead@)  leads the Prime Project Team: Asha and Divya. Sees no department.
--   Dr. Ramesh Kumar (hod@)        heads CSE: Asha and Divya. Karthik (ECE) is outside his department.
insert into public.student_year (student_id, year) values ('5eed0001-0000-0000-0000-000000000001', 2), ('5eed0001-0000-0000-0000-000000000002', 3), ('5eed0001-0000-0000-0000-000000000003', 2);
insert into public.department_memberships (student_id, department_id, valid_from) values
  ('5eed0001-0000-0000-0000-000000000001', '5eedaaaa-0000-0000-0000-000000000001', '2024-06-01'), ('5eed0001-0000-0000-0000-000000000002', '5eedaaaa-0000-0000-0000-000000000002', '2023-06-01'), ('5eed0001-0000-0000-0000-000000000003', '5eedaaaa-0000-0000-0000-000000000001', '2024-06-01');
insert into public.hod_assignments (faculty_id, department_id, valid_from) values ('5eed0006-0000-0000-0000-000000000001', '5eedaaaa-0000-0000-0000-000000000001', '2024-06-01');
insert into public.mentorships (mentor_id, student_id, valid_from) values
  ('5eed0002-0000-0000-0000-000000000001', '5eed0001-0000-0000-0000-000000000001', '2024-06-01'), ('5eed0002-0000-0000-0000-000000000001', '5eed0001-0000-0000-0000-000000000002', '2023-06-01');
insert into public.group_members (group_id, student_id, valid_from) values
  ('5eedbbbb-0000-0000-0000-000000000001', '5eed0001-0000-0000-0000-000000000001', '2024-06-01'), ('5eedbbbb-0000-0000-0000-000000000001', '5eed0001-0000-0000-0000-000000000003', '2024-06-01');
insert into public.group_leads (group_id, faculty_id, valid_from) values ('5eedbbbb-0000-0000-0000-000000000001', '5eed0005-0000-0000-0000-000000000001', '2024-06-01');

insert into public.items (id, type, title, description, meeting_url, starts_at, deadline, requires_confirmation, requires_proof, created_by) values
  ('5eedc000-0000-0000-0000-000000000001', 'hackathon', 'Smart India Hackathon 2026',
   'National round. Tell us how your team placed and attach your certificate.', null, now() + interval '40 days', now() + interval '30 days', true, true, '5eed0002-0000-0000-0000-000000000001'),
  ('5eedc000-0000-0000-0000-000000000002', 'event', 'Google Cloud Study Jam',
   'Free two-hour hands-on session on Saturday.', 'https://meet.google.com/abc-defg-hij', now() + interval '12 days', now() + interval '10 days', false, false, '5eed0002-0000-0000-0000-000000000001'),
  ('5eedc000-0000-0000-0000-000000000003', 'internship', 'Zoho summer internship drive',
   'Campus drive for second-year students.', null, null, now() + interval '20 days', true, false, '5eed0002-0000-0000-0000-000000000001'),
  ('5eedc000-0000-0000-0000-000000000004', 'meeting', 'Team sprint demo',
   'Show what your sub-team built this sprint.', 'https://meet.google.com/xyz-demo-team', now() + interval '7 days', now() + interval '5 days', false, false, '5eed0005-0000-0000-0000-000000000001'),
  ('5eedc000-0000-0000-0000-000000000005', 'event', 'Hackathon prep review',
   'Submit your prep notes before the review.', null, now() - interval '1 day', now() - interval '2 days', true, false, '5eed0005-0000-0000-0000-000000000001'),
  ('5eedc000-0000-0000-0000-000000000006', 'event', 'CSE industry talk',
   'Guest lecture from an industry speaker.', null, now() + interval '14 days', now() + interval '12 days', false, false, '5eed0006-0000-0000-0000-000000000001'),
  ('5eedc000-0000-0000-0000-000000000007', 'internship', 'NPTEL certification drive',
   'Enrol in one NPTEL course and upload the certificate.', null, null, now() + interval '25 days', true, true, '5eed0006-0000-0000-0000-000000000001');

insert into public.invitations (id, item_id, student_id, status, responded_at) values
  ('5eedd000-0000-0000-0000-000000000001', '5eedc000-0000-0000-0000-000000000001', '5eed0001-0000-0000-0000-000000000001', 'joined', now()),
  ('5eedd000-0000-0000-0000-000000000002', '5eedc000-0000-0000-0000-000000000001', '5eed0001-0000-0000-0000-000000000002', 'joined', now()),
  ('5eedd000-0000-0000-0000-000000000003', '5eedc000-0000-0000-0000-000000000002', '5eed0001-0000-0000-0000-000000000001', 'invited', null),
  ('5eedd000-0000-0000-0000-000000000004', '5eedc000-0000-0000-0000-000000000002', '5eed0001-0000-0000-0000-000000000002', 'invited', null),
  ('5eedd000-0000-0000-0000-000000000005', '5eedc000-0000-0000-0000-000000000003', '5eed0001-0000-0000-0000-000000000001', 'declined', now()),
  ('5eedd000-0000-0000-0000-000000000006', '5eedc000-0000-0000-0000-000000000004', '5eed0001-0000-0000-0000-000000000001', 'joined', now()),
  ('5eedd000-0000-0000-0000-000000000007', '5eedc000-0000-0000-0000-000000000004', '5eed0001-0000-0000-0000-000000000003', 'invited', null),
  ('5eedd000-0000-0000-0000-000000000008', '5eedc000-0000-0000-0000-000000000005', '5eed0001-0000-0000-0000-000000000001', 'joined', now()),
  ('5eedd000-0000-0000-0000-000000000009', '5eedc000-0000-0000-0000-000000000005', '5eed0001-0000-0000-0000-000000000003', 'invited', null),
  ('5eedd000-0000-0000-0000-00000000000a', '5eedc000-0000-0000-0000-000000000006', '5eed0001-0000-0000-0000-000000000001', 'joined', now()),
  ('5eedd000-0000-0000-0000-00000000000b', '5eedc000-0000-0000-0000-000000000006', '5eed0001-0000-0000-0000-000000000003', 'joined', now()),
  ('5eedd000-0000-0000-0000-00000000000c', '5eedc000-0000-0000-0000-000000000007', '5eed0001-0000-0000-0000-000000000001', 'joined', now()),
  ('5eedd000-0000-0000-0000-00000000000d', '5eedc000-0000-0000-0000-000000000007', '5eed0001-0000-0000-0000-000000000003', 'joined', now());

-- Asha: confirmed (SIH by her mentor, NPTEL by the HOD). Karthik: a claim waiting on his mentor. Divya: a claim waiting on the HOD.
insert into public.results (invitation_id, revision, outcome, details, status, confirmed_by, confirmed_at) values
  ('5eedd000-0000-0000-0000-000000000001', 1, 'Finalist, national round', 'Team of four; built a flood-alert dashboard.', 'confirmed', '5eed0002-0000-0000-0000-000000000001', now()),
  ('5eedd000-0000-0000-0000-00000000000c', 1, 'Completed: Cloud Computing', 'Elite certificate, 82 percent.', 'confirmed', '5eed0006-0000-0000-0000-000000000001', now());
insert into public.results (invitation_id, revision, outcome, details, status) values
  ('5eedd000-0000-0000-0000-000000000002', 1, 'Participated in the national round', 'Certificate arrives next week.', 'submitted'),
  ('5eedd000-0000-0000-0000-00000000000d', 1, 'Completed: Data Structures', 'Passed with 76 percent.', 'submitted');
