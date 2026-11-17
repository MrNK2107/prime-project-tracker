-- Task 2: identity, dated relationship links, visibility function and RLS.
--
-- Rules (spec "Roles and visibility"):
--   * roles: student, faculty, admin, principal. Mentor / group lead / HOD come from link rows.
--   * links are dated; active when valid_from <= current_date and (valid_to is null or valid_to >= current_date).
--     Links are never deleted (no delete policy); they are ended by setting valid_to.
--   * only active profiles (active = true) can read anything.
--   * admin manages accounts and links only; principal is read-only.

create type public.user_role as enum ('student', 'faculty', 'admin', 'principal');

-- ------------------------------------------------------------------ tables

create table public.profiles (
  id        uuid primary key references auth.users (id) on delete cascade,
  email     text not null unique,
  full_name text,
  role      public.user_role not null,
  active    boolean not null default true
);

create table public.departments (
  id   uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table public.student_year (
  student_id uuid primary key references public.profiles (id),
  year       smallint not null check (year > 0)
);

create table public.department_memberships (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.profiles (id),
  department_id uuid not null references public.departments (id),
  valid_from    date not null,
  valid_to      date null
);

create table public.hod_assignments (
  id            uuid primary key default gen_random_uuid(),
  faculty_id    uuid not null references public.profiles (id),
  department_id uuid not null references public.departments (id),
  valid_from    date not null,
  valid_to      date null
);

create table public.groups (
  id   uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table public.group_members (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups (id),
  student_id uuid not null references public.profiles (id),
  valid_from date not null,
  valid_to   date null
);

create table public.group_leads (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups (id),
  faculty_id uuid not null references public.profiles (id),
  valid_from date not null,
  valid_to   date null
);

create table public.mentorships (
  id         uuid primary key default gen_random_uuid(),
  mentor_id  uuid not null references public.profiles (id),
  student_id uuid not null references public.profiles (id),
  valid_from date not null,
  valid_to   date null
);

create index department_memberships_student_idx on public.department_memberships (student_id);
create index department_memberships_department_idx on public.department_memberships (department_id);
create index hod_assignments_faculty_idx on public.hod_assignments (faculty_id);
create index group_members_student_idx on public.group_members (student_id);
create index group_members_group_idx on public.group_members (group_id);
create index group_leads_faculty_idx on public.group_leads (faculty_id);
create index mentorships_mentor_idx on public.mentorships (mentor_id);
create index mentorships_student_idx on public.mentorships (student_id);

-- ------------------------------------------------------------------ functions

-- True when the caller has a profile with active = true (invite-only login).
create function public.is_active_user()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.active
  );
$$;

-- Role of the caller, or null when the caller has no active profile.
create function public.current_role_of()
returns public.user_role
language sql stable security definer
set search_path = ''
as $$
  select p.role from public.profiles p
  where p.id = (select auth.uid()) and p.active;
$$;

-- Can `viewer` see `student`? True when viewer = student, viewer is the principal,
-- or viewer is faculty with an active mentorship, an active group lead of a group the
-- student is an active member of, or an active HOD of the student's active department.
-- The viewer must be active. An authenticated caller may only ask about itself as viewer
-- (prevents probing other people's relationships); policies always pass auth.uid().
create function public.can_see_student(viewer uuid, student uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case
    when viewer is null or student is null then false
    when (select auth.uid()) is not null and viewer <> (select auth.uid()) then false
    else exists (
      select 1 from public.profiles v
      where v.id = viewer
        and v.active
        and (
          v.id = student
          or (v.role = 'principal'
              and exists (select 1 from public.profiles s
                          where s.id = student and s.role = 'student'))
          or (v.role = 'faculty' and (
                exists (select 1 from public.mentorships m
                        where m.mentor_id = viewer and m.student_id = student
                          and m.valid_from <= current_date
                          and (m.valid_to is null or m.valid_to >= current_date))
             or exists (select 1 from public.group_leads gl
                        join public.group_members gm on gm.group_id = gl.group_id
                        where gl.faculty_id = viewer and gm.student_id = student
                          and gl.valid_from <= current_date
                          and (gl.valid_to is null or gl.valid_to >= current_date)
                          and gm.valid_from <= current_date
                          and (gm.valid_to is null or gm.valid_to >= current_date))
             or exists (select 1 from public.hod_assignments h
                        join public.department_memberships dm on dm.department_id = h.department_id
                        where h.faculty_id = viewer and dm.student_id = student
                          and h.valid_from <= current_date
                          and (h.valid_to is null or h.valid_to >= current_date)
                          and dm.valid_from <= current_date
                          and (dm.valid_to is null or dm.valid_to >= current_date))
          ))
        )
    )
  end;
$$;

revoke execute on function public.is_active_user() from public, anon, service_role;
revoke execute on function public.current_role_of() from public, anon, service_role;
revoke execute on function public.can_see_student(uuid, uuid) from public, anon, service_role;
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.current_role_of() to authenticated;
grant execute on function public.can_see_student(uuid, uuid) to authenticated;

-- ------------------------------------------------------------------ RLS

alter table public.profiles               enable row level security;
alter table public.departments            enable row level security;
alter table public.student_year           enable row level security;
alter table public.department_memberships enable row level security;
alter table public.hod_assignments        enable row level security;
alter table public.groups                 enable row level security;
alter table public.group_members          enable row level security;
alter table public.group_leads            enable row level security;
alter table public.mentorships            enable row level security;

-- anon never reads identity data.
revoke all on public.profiles, public.departments, public.student_year,
  public.department_memberships, public.hod_assignments, public.groups,
  public.group_members, public.group_leads, public.mentorships from anon;

-- profiles ----------------------------------------------------------
-- Student rows: only viewers who can see that student (self, principal, links) and admin.
-- Faculty/admin/principal rows: any active user (to show creator names).
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    (select public.is_active_user())
    and (
      id = (select auth.uid())
      or role <> 'student'
      or (select public.current_role_of()) = 'admin'
      or public.can_see_student((select auth.uid()), id)
    )
  );

-- Admin creates and deactivates accounts; nobody else writes profiles.
-- The principal is a single seeded account: admin can neither create nor modify it.
create policy profiles_admin_insert on public.profiles
  for insert to authenticated
  with check ((select public.current_role_of()) = 'admin' and role <> 'principal');

create policy profiles_admin_update on public.profiles
  for update to authenticated
  using ((select public.current_role_of()) = 'admin' and role <> 'principal')
  with check ((select public.current_role_of()) = 'admin' and role <> 'principal');

-- departments / groups: reference data, readable by active users, written by admin.
create policy departments_select on public.departments
  for select to authenticated using ((select public.is_active_user()));
create policy departments_admin_insert on public.departments
  for insert to authenticated with check ((select public.current_role_of()) = 'admin');
create policy departments_admin_update on public.departments
  for update to authenticated
  using ((select public.current_role_of()) = 'admin')
  with check ((select public.current_role_of()) = 'admin');

create policy groups_select on public.groups
  for select to authenticated using ((select public.is_active_user()));
create policy groups_admin_insert on public.groups
  for insert to authenticated with check ((select public.current_role_of()) = 'admin');
create policy groups_admin_update on public.groups
  for update to authenticated
  using ((select public.current_role_of()) = 'admin')
  with check ((select public.current_role_of()) = 'admin');

-- faculty-keyed links (who is HOD / group lead): readable by active users.
create policy hod_assignments_select on public.hod_assignments
  for select to authenticated using ((select public.is_active_user()));
create policy hod_assignments_admin_insert on public.hod_assignments
  for insert to authenticated with check ((select public.current_role_of()) = 'admin');
create policy hod_assignments_admin_update on public.hod_assignments
  for update to authenticated
  using ((select public.current_role_of()) = 'admin')
  with check ((select public.current_role_of()) = 'admin');

create policy group_leads_select on public.group_leads
  for select to authenticated using ((select public.is_active_user()));
create policy group_leads_admin_insert on public.group_leads
  for insert to authenticated with check ((select public.current_role_of()) = 'admin');
create policy group_leads_admin_update on public.group_leads
  for update to authenticated
  using ((select public.current_role_of()) = 'admin')
  with check ((select public.current_role_of()) = 'admin');

-- student-keyed links: admin/principal read all; others read rows for students they can see.
create policy student_year_select on public.student_year
  for select to authenticated
  using (
    (select public.current_role_of()) in ('admin', 'principal')
    or public.can_see_student((select auth.uid()), student_id)
  );
create policy student_year_admin_insert on public.student_year
  for insert to authenticated with check ((select public.current_role_of()) = 'admin');
create policy student_year_admin_update on public.student_year
  for update to authenticated
  using ((select public.current_role_of()) = 'admin')
  with check ((select public.current_role_of()) = 'admin');

create policy department_memberships_select on public.department_memberships
  for select to authenticated
  using (
    (select public.current_role_of()) in ('admin', 'principal')
    or public.can_see_student((select auth.uid()), student_id)
  );
create policy department_memberships_admin_insert on public.department_memberships
  for insert to authenticated with check ((select public.current_role_of()) = 'admin');
create policy department_memberships_admin_update on public.department_memberships
  for update to authenticated
  using ((select public.current_role_of()) = 'admin')
  with check ((select public.current_role_of()) = 'admin');

create policy group_members_select on public.group_members
  for select to authenticated
  using (
    (select public.current_role_of()) in ('admin', 'principal')
    or public.can_see_student((select auth.uid()), student_id)
  );
create policy group_members_admin_insert on public.group_members
  for insert to authenticated with check ((select public.current_role_of()) = 'admin');
create policy group_members_admin_update on public.group_members
  for update to authenticated
  using ((select public.current_role_of()) = 'admin')
  with check ((select public.current_role_of()) = 'admin');

-- mentorships: additionally a mentor reads their own rows (including ended ones).
create policy mentorships_select on public.mentorships
  for select to authenticated
  using (
    (select public.current_role_of()) in ('admin', 'principal')
    or ((select public.is_active_user()) and mentor_id = (select auth.uid()))
    or public.can_see_student((select auth.uid()), student_id)
  );
create policy mentorships_admin_insert on public.mentorships
  for insert to authenticated with check ((select public.current_role_of()) = 'admin');
create policy mentorships_admin_update on public.mentorships
  for update to authenticated
  using ((select public.current_role_of()) = 'admin')
  with check ((select public.current_role_of()) = 'admin');

-- No delete policies anywhere: links are ended with valid_to, accounts are deactivated.
