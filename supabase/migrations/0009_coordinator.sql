-- Group coordinator: the highest authority over a group's events.
--
-- A group can have ordinary leads (they see the group and post events to it) and coordinators.
-- A coordinator, for the students currently in that group:
--   * can confirm or send back any student's result, whoever posted the event or mentors the student;
--   * can edit any event that has one of the group's students invited (title, description, meeting link,
--     start, reply-by date). Who is invited and what the event requires stay fixed once posted.
-- Visibility is unchanged: a coordinator is also a lead, and leads already see their group's students.
--
-- Deployed databases get this as a new migration (0001 to 0008 are already applied there).

alter table public.group_leads add column is_coordinator boolean not null default false;

-- True when the caller is an active coordinator of a group the student is currently in.
-- Answers only about auth.uid(), like the other visibility helpers.
create function public.coordinates_student(p_student uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_leads gl
    join public.group_members gm on gm.group_id = gl.group_id
    where gl.faculty_id = (select auth.uid())
      and gl.is_coordinator
      and gm.student_id = p_student
      and gl.valid_from <= current_date and (gl.valid_to is null or gl.valid_to >= current_date)
      and gm.valid_from <= current_date and (gm.valid_to is null or gm.valid_to >= current_date)
      and (select public.current_role_of()) = 'faculty'
  );
$$;

revoke execute on function public.coordinates_student(uuid) from public, anon, service_role;
grant execute on function public.coordinates_student(uuid) to authenticated;

-- Admin: assign a group lead, optionally as coordinator (a no-op when already a lead with the same flag).
create function public.admin_assign_group_lead(p_group uuid, p_faculty uuid, p_coordinator boolean) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  perform public.admin_guard();
  if not exists (select 1 from public.profiles where id = p_faculty and role = 'faculty' and active) then
    raise exception 'group lead must be an active faculty member' using errcode = '22023';
  end if;
  if exists (select 1 from public.group_leads
             where group_id = p_group and faculty_id = p_faculty and is_coordinator = coalesce(p_coordinator, false)
               and valid_from <= current_date and (valid_to is null or valid_to >= current_date)) then
    return;
  end if;
  -- Changing the flag ends the old link and starts a new one (history is never rewritten).
  update public.group_leads set valid_to = current_date - 1
   where group_id = p_group and faculty_id = p_faculty
     and valid_from <= current_date and (valid_to is null or valid_to >= current_date);
  insert into public.group_leads (group_id, faculty_id, valid_from, is_coordinator)
  values (p_group, p_faculty, current_date, coalesce(p_coordinator, false));
end $$;

revoke execute on function public.admin_assign_group_lead(uuid, uuid, boolean) from public, anon, service_role;
grant execute on function public.admin_assign_group_lead(uuid, uuid, boolean) to authenticated;

-- review_result: the item creator, the student's current mentor, or a coordinator of the student's group.
create or replace function public.review_result(p_result_id uuid, p_decision text, p_note text)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_uid        uuid := (select auth.uid());
  v_status     public.result_status;
  v_inv_id     uuid;
  v_student    uuid;
  v_created_by uuid;
begin
  if p_decision is null or p_decision not in ('confirm', 'send_back') then
    raise exception 'decision must be confirm or send_back' using errcode = '22023';
  end if;

  select r.status, r.invitation_id, inv.student_id, i.created_by
    into v_status, v_inv_id, v_student, v_created_by
  from public.results r
  join public.invitations inv on inv.id = r.invitation_id
  join public.items i on i.id = inv.item_id
  where r.id = p_result_id
  for update of r, inv;

  if not found
     or v_uid is null
     or (select public.current_role_of()) is distinct from 'faculty'
     or not (v_created_by = v_uid
             or public.coordinates_student(v_student)
             or exists (select 1 from public.mentorships m
                        where m.mentor_id = v_uid and m.student_id = v_student
                          and m.valid_from <= current_date
                          and (m.valid_to is null or m.valid_to >= current_date))) then
    -- same error whether the result is missing or the caller has no authority
    raise exception 'only the event creator, the student''s current mentor or a group coordinator can review'
      using errcode = '42501';
  end if;

  if v_status <> 'submitted' then
    raise exception 'only a submitted result can be reviewed (status %)', v_status
      using errcode = '22023';
  end if;

  if p_decision = 'send_back' then
    if btrim(coalesce(p_note, '')) = '' then
      raise exception 'sending back requires a note' using errcode = '22023';
    end if;
    update public.results set status = 'sent_back', review_note = p_note
    where id = p_result_id;
    return;
  end if;

  -- confirm: retire the previously counting value first (one confirmed row per invitation)
  perform set_config('app.allow_supersede', 'on', true);
  update public.results set status = 'superseded'
  where invitation_id = v_inv_id and status = 'confirmed' and id <> p_result_id;
  perform set_config('app.allow_supersede', 'off', true);

  update public.results
  set status = 'confirmed', confirmed_by = v_uid, confirmed_at = now(), review_note = p_note
  where id = p_result_id;
end;
$$;

-- update_item: edit an event's wording and dates. Allowed for its creator and for a coordinator of a group that
-- has an invited student. Only keys present in p_changes change (title, description, meeting_url, starts_at,
-- deadline); who is invited and what the event requires are never changed here.
create function public.update_item(p_item_id uuid, p_changes jsonb)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_creator uuid;
  v_title   text;
begin
  if v_uid is null or (select public.current_role_of()) is distinct from 'faculty' then
    raise exception 'only active faculty can edit events' using errcode = '42501';
  end if;

  select i.created_by into v_creator from public.items i where i.id = p_item_id for update;
  if not found
     or not (v_creator = v_uid
             or exists (select 1 from public.invitations inv
                        where inv.item_id = p_item_id and public.coordinates_student(inv.student_id))) then
    raise exception 'event not found or not yours to edit' using errcode = '42501';
  end if;

  if p_changes ? 'title' then
    v_title := btrim(coalesce(p_changes ->> 'title', ''));
    if v_title = '' then
      raise exception 'title must not be empty' using errcode = '22023';
    end if;
  end if;

  update public.items i
  set title       = coalesce(v_title, i.title),
      description = case when p_changes ? 'description' then p_changes ->> 'description' else i.description end,
      meeting_url = case when p_changes ? 'meeting_url' then p_changes ->> 'meeting_url' else i.meeting_url end,
      starts_at   = case when p_changes ? 'starts_at' then (p_changes ->> 'starts_at')::timestamptz else i.starts_at end,
      deadline    = case when p_changes ? 'deadline' then (p_changes ->> 'deadline')::timestamptz else i.deadline end
  where i.id = p_item_id;
end;
$$;

revoke execute on function public.update_item(uuid, jsonb) from public, anon, service_role;
grant execute on function public.update_item(uuid, jsonb) to authenticated;
