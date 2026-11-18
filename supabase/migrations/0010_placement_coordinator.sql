-- Hackathon and placement coordinator: a faculty role (like mentor, group lead, head of department) that is not tied to
-- one group or department. While active, the person:
--   * sees every student, so they can post events to anyone and track progress across the whole college;
--   * as before, confirms results and edits events only where another rule gives them authority (events they posted,
--     their mentees, groups they coordinate).
-- Held through dated link rows like the other capacities; granted by the admin; never deleted, only ended.

create table public.placement_coordinators (
  id         uuid primary key default gen_random_uuid(),
  faculty_id uuid not null references public.profiles (id),
  valid_from date not null,
  valid_to   date null
);
create index placement_coordinators_faculty_idx on public.placement_coordinators (faculty_id);

alter table public.placement_coordinators enable row level security;
revoke all on public.placement_coordinators from anon;
revoke truncate on public.placement_coordinators from authenticated, anon;
revoke update on public.placement_coordinators from authenticated;
grant update (valid_to) on public.placement_coordinators to authenticated;

create policy placement_coordinators_select on public.placement_coordinators
  for select to authenticated using ((select public.is_active_user()));
create policy placement_coordinators_admin_insert on public.placement_coordinators
  for insert to authenticated with check ((select public.current_role_of()) = 'admin');
create policy placement_coordinators_admin_update on public.placement_coordinators
  for update to authenticated
  using ((select public.current_role_of()) = 'admin')
  with check ((select public.current_role_of()) = 'admin');

create trigger audit_placement_coordinators
  after insert or update or delete on public.placement_coordinators
  for each row execute function public.audit_row_change('id,faculty_id', 'valid_from,valid_to');

-- True when the caller is an active faculty member holding the role today (answers only about auth.uid()).
create function public.is_placement_coordinator()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.placement_coordinators pc
    where pc.faculty_id = (select auth.uid())
      and pc.valid_from <= current_date and (pc.valid_to is null or pc.valid_to >= current_date)
      and (select public.current_role_of()) = 'faculty'
  );
$$;
revoke execute on function public.is_placement_coordinator() from public, anon, service_role;
grant execute on function public.is_placement_coordinator() to authenticated;

-- can_see_student: the earlier rules plus "an active placement coordinator sees every student".
create or replace function public.can_see_student(viewer uuid, student uuid)
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
          or (v.role in ('principal', 'admin')
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
             or (exists (select 1 from public.placement_coordinators pc
                         where pc.faculty_id = viewer
                           and pc.valid_from <= current_date
                           and (pc.valid_to is null or pc.valid_to >= current_date))
                 and exists (select 1 from public.profiles s
                             where s.id = student and s.role = 'student'))
          ))
        )
    )
  end;
$$;

-- visible_student_ids: the same set, in set-returning form (stays equal to can_see_student; 20_items.sql asserts it).
create or replace function public.visible_student_ids()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  with me as (
    select p.id, p.role from public.profiles p
    where p.id = (select auth.uid()) and p.active
  )
  select me.id from me
  union
  select s.id from public.profiles s, me
  where me.role in ('principal', 'admin') and s.role = 'student'
  union
  select s.id from public.profiles s, me
  where me.role = 'faculty' and s.role = 'student'
    and exists (select 1 from public.placement_coordinators pc
                where pc.faculty_id = me.id
                  and pc.valid_from <= current_date
                  and (pc.valid_to is null or pc.valid_to >= current_date))
  union
  select m.student_id from public.mentorships m, me
  where me.role = 'faculty' and m.mentor_id = me.id
    and m.valid_from <= current_date
    and (m.valid_to is null or m.valid_to >= current_date)
  union
  select gm.student_id from public.group_leads gl
  join public.group_members gm on gm.group_id = gl.group_id
  join me on me.id = gl.faculty_id
  where me.role = 'faculty'
    and gl.valid_from <= current_date
    and (gl.valid_to is null or gl.valid_to >= current_date)
    and gm.valid_from <= current_date
    and (gm.valid_to is null or gm.valid_to >= current_date)
  union
  select dm.student_id from public.hod_assignments h
  join public.department_memberships dm on dm.department_id = h.department_id
  join me on me.id = h.faculty_id
  where me.role = 'faculty'
    and h.valid_from <= current_date
    and (h.valid_to is null or h.valid_to >= current_date)
    and dm.valid_from <= current_date
    and (dm.valid_to is null or dm.valid_to >= current_date);
$$;

-- Admin: grant and end the role.
create function public.admin_assign_placement_coordinator(p_faculty uuid) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  perform public.admin_guard();
  if not exists (select 1 from public.profiles where id = p_faculty and role = 'faculty' and active) then
    raise exception 'must be an active faculty member' using errcode = '22023';
  end if;
  if exists (select 1 from public.placement_coordinators
             where faculty_id = p_faculty and valid_from <= current_date and (valid_to is null or valid_to >= current_date)) then
    return;
  end if;
  insert into public.placement_coordinators (faculty_id, valid_from) values (p_faculty, current_date);
end $$;

create function public.admin_remove_placement_coordinator(p_faculty uuid) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  perform public.admin_guard();
  update public.placement_coordinators set valid_to = current_date - 1
   where faculty_id = p_faculty and valid_from <= current_date and (valid_to is null or valid_to >= current_date);
end $$;

revoke execute on function public.admin_assign_placement_coordinator(uuid), public.admin_remove_placement_coordinator(uuid)
  from public, anon, service_role;
grant execute on function public.admin_assign_placement_coordinator(uuid), public.admin_remove_placement_coordinator(uuid)
  to authenticated;
