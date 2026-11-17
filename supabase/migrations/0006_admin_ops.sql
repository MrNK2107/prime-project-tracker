-- Task 8: admin operations that touch several rows at once.
--
-- Each function runs as the caller (security invoker), so row-level security still applies, and
-- each refuses anyone who is not an active admin (42501). Running inside one function call makes
-- "end the old link, start the new one" a single transaction. Links are never deleted: an old
-- link is ended with valid_to = yesterday (valid_to is inclusive), and the new one starts today.
-- Changes are recorded by the audit triggers from 0004.
--
-- Error codes: 42501 not allowed, 22023 bad input, P0001 refused (see message).

create function public.admin_guard() returns void
language plpgsql stable security invoker set search_path = '' as $$
begin
  if (select public.current_role_of()) is distinct from 'admin' then
    raise exception 'admin only' using errcode = '42501';
  end if;
end $$;

-- Mentor of a student: ends the student's current mentorship (if with someone else), starts a new one.
create function public.admin_assign_mentor(p_mentor uuid, p_student uuid) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  perform public.admin_guard();
  if not exists (select 1 from public.profiles where id = p_mentor and role = 'faculty' and active) then
    raise exception 'mentor must be an active faculty member' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_student and role = 'student' and active) then
    raise exception 'student must be an active student' using errcode = '22023';
  end if;
  if exists (select 1 from public.mentorships
             where student_id = p_student and mentor_id = p_mentor
               and valid_from <= current_date and (valid_to is null or valid_to >= current_date)) then
    return;
  end if;
  update public.mentorships set valid_to = current_date - 1
   where student_id = p_student
     and valid_from <= current_date and (valid_to is null or valid_to >= current_date);
  insert into public.mentorships (mentor_id, student_id, valid_from) values (p_mentor, p_student, current_date);
end $$;

create function public.admin_add_to_group(p_group uuid, p_student uuid) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  perform public.admin_guard();
  if not exists (select 1 from public.profiles where id = p_student and role = 'student' and active) then
    raise exception 'student must be an active student' using errcode = '22023';
  end if;
  if exists (select 1 from public.group_members
             where group_id = p_group and student_id = p_student
               and valid_from <= current_date and (valid_to is null or valid_to >= current_date)) then
    return;
  end if;
  insert into public.group_members (group_id, student_id, valid_from) values (p_group, p_student, current_date);
end $$;

create function public.admin_remove_from_group(p_group uuid, p_student uuid) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  perform public.admin_guard();
  update public.group_members set valid_to = current_date - 1
   where group_id = p_group and student_id = p_student
     and valid_from <= current_date and (valid_to is null or valid_to >= current_date);
end $$;

-- A department has one HOD at a time: ends the current one (if someone else) and starts the new one.
create function public.admin_assign_hod(p_faculty uuid, p_department uuid) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  perform public.admin_guard();
  if not exists (select 1 from public.profiles where id = p_faculty and role = 'faculty' and active) then
    raise exception 'HOD must be an active faculty member' using errcode = '22023';
  end if;
  if exists (select 1 from public.hod_assignments
             where department_id = p_department and faculty_id = p_faculty
               and valid_from <= current_date and (valid_to is null or valid_to >= current_date)) then
    return;
  end if;
  update public.hod_assignments set valid_to = current_date - 1
   where department_id = p_department
     and valid_from <= current_date and (valid_to is null or valid_to >= current_date);
  insert into public.hod_assignments (faculty_id, department_id, valid_from) values (p_faculty, p_department, current_date);
end $$;

-- A group can have several leads: this adds one (no-op if already a lead).
create function public.admin_assign_group_lead(p_group uuid, p_faculty uuid) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  perform public.admin_guard();
  if not exists (select 1 from public.profiles where id = p_faculty and role = 'faculty' and active) then
    raise exception 'group lead must be an active faculty member' using errcode = '22023';
  end if;
  if exists (select 1 from public.group_leads
             where group_id = p_group and faculty_id = p_faculty
               and valid_from <= current_date and (valid_to is null or valid_to >= current_date)) then
    return;
  end if;
  insert into public.group_leads (group_id, faculty_id, valid_from) values (p_group, p_faculty, current_date);
end $$;

create function public.admin_remove_group_lead(p_group uuid, p_faculty uuid) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  perform public.admin_guard();
  update public.group_leads set valid_to = current_date - 1
   where group_id = p_group and faculty_id = p_faculty
     and valid_from <= current_date and (valid_to is null or valid_to >= current_date);
end $$;

-- A student is in one department at a time. A second change on the same day is refused, because a
-- link started today cannot be ended before it began (history is never rewritten).
create function public.admin_move_department(p_student uuid, p_department uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  cur record;
begin
  perform public.admin_guard();
  if not exists (select 1 from public.profiles where id = p_student and role = 'student' and active) then
    raise exception 'student must be an active student' using errcode = '22023';
  end if;
  select * into cur from public.department_memberships
   where student_id = p_student
     and valid_from <= current_date and (valid_to is null or valid_to >= current_date);
  if found then
    if cur.department_id = p_department then return; end if;
    if cur.valid_from >= current_date then
      raise exception 'this student was already placed in a department today; try again tomorrow'
        using errcode = 'P0001';
    end if;
    update public.department_memberships set valid_to = current_date - 1 where id = cur.id;
  end if;
  insert into public.department_memberships (student_id, department_id, valid_from)
  values (p_student, p_department, current_date);
end $$;

create function public.admin_set_student_year(p_student uuid, p_year smallint) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  perform public.admin_guard();
  if p_year is null or p_year < 1 or p_year > 6 then
    raise exception 'year must be between 1 and 6' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_student and role = 'student') then
    raise exception 'not a student' using errcode = '22023';
  end if;
  insert into public.student_year (student_id, year) values (p_student, p_year)
  on conflict (student_id) do update set year = excluded.year;
end $$;

-- Moves every active student (in the given department, or everywhere) up one year. Returns the count.
create function public.admin_promote_year(p_department uuid default null) returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  n integer;
begin
  perform public.admin_guard();
  update public.student_year sy set year = sy.year + 1
   where sy.year < 6
     and exists (select 1 from public.profiles p where p.id = sy.student_id and p.role = 'student' and p.active)
     and (p_department is null or exists (
           select 1 from public.department_memberships dm
            where dm.student_id = sy.student_id and dm.department_id = p_department
              and dm.valid_from <= current_date and (dm.valid_to is null or dm.valid_to >= current_date)));
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function
  public.admin_guard(), public.admin_assign_mentor(uuid, uuid), public.admin_add_to_group(uuid, uuid),
  public.admin_remove_from_group(uuid, uuid), public.admin_assign_hod(uuid, uuid),
  public.admin_assign_group_lead(uuid, uuid), public.admin_remove_group_lead(uuid, uuid),
  public.admin_move_department(uuid, uuid), public.admin_set_student_year(uuid, smallint),
  public.admin_promote_year(uuid)
  from public, anon, service_role;
grant execute on function
  public.admin_guard(), public.admin_assign_mentor(uuid, uuid), public.admin_add_to_group(uuid, uuid),
  public.admin_remove_from_group(uuid, uuid), public.admin_assign_hod(uuid, uuid),
  public.admin_assign_group_lead(uuid, uuid), public.admin_remove_group_lead(uuid, uuid),
  public.admin_move_department(uuid, uuid), public.admin_set_student_year(uuid, smallint),
  public.admin_promote_year(uuid)
  to authenticated;
