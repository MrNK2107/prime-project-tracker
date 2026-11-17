-- Task 3: items, invitations, targeting.
--
-- Rules (spec "Decisions" 3, 4 and "Builder's calls"):
--   * targeting (groups, departments, years, hand-picked students) is resolved to explicit
--     invitation rows at creation time;
--   * faculty can only target students they can already see: students for whom
--     can_see_student(auth.uid(), student) is false are silently dropped;
--   * a user sees an item if they created it, were invited to it, or can see an invited
--     student; the principal sees every item; admin sees none;
--   * a user sees an invitation if they are the invited student, created the item, or can
--     see the invited student;
--   * no direct writes: items and invitations are written only by create_item and
--     respond_to_invitation (security definer).

create type public.item_type as enum ('hackathon', 'internship', 'event', 'meeting');
create type public.invitation_status as enum ('invited', 'joined', 'declined');

-- ------------------------------------------------------------------ tables

create table public.items (
  id                    uuid primary key default gen_random_uuid(),
  type                  public.item_type not null,
  title                 text not null check (btrim(title) <> ''),
  description           text,
  meeting_url           text,
  starts_at             timestamptz,
  deadline              timestamptz,          -- optional; responses rejected when now() > deadline
  requires_confirmation boolean not null default false,
  requires_proof        boolean not null default false,
  created_by            uuid not null references public.profiles (id),
  created_at            timestamptz not null default now()
);

create table public.invitations (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references public.items (id),
  student_id   uuid not null references public.profiles (id),
  status       public.invitation_status not null default 'invited',
  responded_at timestamptz,
  constraint invitations_item_student_key unique (item_id, student_id)
);

create index items_created_by_idx on public.items (created_by);
create index invitations_student_idx on public.invitations (student_id);

-- ------------------------------------------------------------------ visibility helpers
-- Set-returning security definer helpers, used as `x in (select helper())` so the planner
-- can semi-join (and hash) once per query instead of calling a function per row. They also
-- let the invitations policy reach items without recursing through items RLS.
-- Both answer only about auth.uid().

-- Every profile id the caller can see as a student. Must equal
--   { s : public.can_see_student(auth.uid(), s) }
-- (can_see_student stays the single source of truth; 20_items.sql asserts the equality
-- for every fixture role). Empty for an inactive or anonymous caller.
create function public.visible_student_ids()
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

-- Ids of items the (active) caller created.
create function public.created_item_ids()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select i.id from public.items i
  where i.created_by = (select auth.uid())
    and (select public.is_active_user());
$$;

revoke execute on function public.visible_student_ids() from public, anon, service_role;
revoke execute on function public.created_item_ids() from public, anon, service_role;
grant execute on function public.visible_student_ids() to authenticated;
grant execute on function public.created_item_ids() to authenticated;

-- ------------------------------------------------------------------ create_item
-- Faculty only (active). Inserts the item, expands targets to the union of
--   active members of p_group_ids, active members of p_department_ids,
--   students whose year is in p_years, and p_student_ids,
-- keeps only active students the caller can see, inserts one invitation each and
-- returns the item id. Zero resulting invitations is allowed.
create function public.create_item(
  p_item           jsonb,
  p_group_ids      uuid[],
  p_department_ids uuid[],
  p_years          smallint[],
  p_student_ids    uuid[]
)
returns uuid
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_type  text := p_item ->> 'type';
  v_title text := btrim(coalesce(p_item ->> 'title', ''));
  v_id    uuid;
begin
  if v_uid is null or public.current_role_of() is distinct from 'faculty' then
    raise exception 'only active faculty can create items' using errcode = '42501';
  end if;

  if v_type is null or not (v_type = any (enum_range(null::public.item_type)::text[])) then
    raise exception 'invalid item type: %', coalesce(v_type, '(missing)') using errcode = '22023';
  end if;
  if v_title = '' then
    raise exception 'title must not be empty' using errcode = '22023';
  end if;

  insert into public.items (type, title, description, meeting_url, starts_at, deadline,
                            requires_confirmation, requires_proof, created_by)
  values (v_type::public.item_type,
          v_title,
          p_item ->> 'description',
          p_item ->> 'meeting_url',
          (p_item ->> 'starts_at')::timestamptz,
          (p_item ->> 'deadline')::timestamptz,
          coalesce((p_item ->> 'requires_confirmation')::boolean, false),
          coalesce((p_item ->> 'requires_proof')::boolean, false),
          v_uid)
  returning id into v_id;

  insert into public.invitations (item_id, student_id)
  select v_id, t.student_id
  from (
    select gm.student_id from public.group_members gm
    where gm.group_id = any (coalesce(p_group_ids, '{}'))
      and gm.valid_from <= current_date
      and (gm.valid_to is null or gm.valid_to >= current_date)
    union
    select dm.student_id from public.department_memberships dm
    where dm.department_id = any (coalesce(p_department_ids, '{}'))
      and dm.valid_from <= current_date
      and (dm.valid_to is null or dm.valid_to >= current_date)
    union
    select sy.student_id from public.student_year sy
    where sy.year = any (coalesce(p_years, '{}'))
    union
    select s from unnest(coalesce(p_student_ids, '{}')) s
  ) t
  join public.profiles p on p.id = t.student_id and p.role = 'student' and p.active
  where public.can_see_student(v_uid, t.student_id)
  on conflict (item_id, student_id) do nothing;

  return v_id;
end;
$$;

-- ------------------------------------------------------------------ respond_to_invitation
-- Invited student only (active); new status joined or declined; may switch between
-- joined and declined until the deadline; rejected when now() > deadline, and rejected
-- (status change) once the invitation has any result.
create function public.respond_to_invitation(p_invitation_id uuid, p_status public.invitation_status)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_status   public.invitation_status;
  v_deadline timestamptz;
begin
  if p_status is null or p_status not in ('joined', 'declined') then
    raise exception 'status must be joined or declined' using errcode = '22023';
  end if;

  select inv.status, i.deadline into v_status, v_deadline
  from public.invitations inv
  join public.items i on i.id = inv.item_id
  where inv.id = p_invitation_id
    and inv.student_id = v_uid
    and (select public.is_active_user())
  for update of inv;

  if not found then
    -- same error whether the invitation is missing or belongs to someone else
    raise exception 'invitation not found' using errcode = '42501';
  end if;

  if v_status not in ('invited', 'joined', 'declined') then
    raise exception 'invitation can no longer be changed' using errcode = '22023';
  end if;

  -- Once a result exists (public.results, created in 0003_results.sql) the student cannot
  -- un-join: confirmed results are locked and submitted ones must keep a joined invitation.
  if p_status <> v_status
     and exists (select 1 from public.results r where r.invitation_id = p_invitation_id) then
    raise exception 'invitation has a result and can no longer be changed' using errcode = '22023';
  end if;

  if v_deadline is not null and now() > v_deadline then
    raise exception 'deadline has passed';
  end if;

  update public.invitations
  set status = p_status, responded_at = now()
  where id = p_invitation_id;
end;
$$;

revoke execute on function public.create_item(jsonb, uuid[], uuid[], smallint[], uuid[])
  from public, anon, service_role;
revoke execute on function public.respond_to_invitation(uuid, public.invitation_status)
  from public, anon, service_role;
grant execute on function public.create_item(jsonb, uuid[], uuid[], smallint[], uuid[]) to authenticated;
grant execute on function public.respond_to_invitation(uuid, public.invitation_status) to authenticated;

-- ------------------------------------------------------------------ RLS

alter table public.items       enable row level security;
alter table public.invitations enable row level security;

revoke all on public.items, public.invitations from anon;
-- writes only through the security definer functions above
revoke insert, update, delete, truncate on public.items, public.invitations from authenticated;

-- Indexable fast paths first (own rows via items_created_by_idx / invitations_student_idx),
-- then semi-joins against the set-returning helpers. invitations(item_id) lookups use the
-- unique (item_id, student_id) index.
create policy items_select on public.items
  for select to authenticated
  using (
    ((select public.is_active_user()) and created_by = (select auth.uid()))
    or id in (select inv.item_id from public.invitations inv
              where inv.student_id = (select auth.uid()))
    or (select public.current_role_of()) in ('principal', 'admin')
    or id in (select inv.item_id from public.invitations inv
              where inv.student_id in (select public.visible_student_ids()))
  );

create policy invitations_select on public.invitations
  for select to authenticated
  using (
    ((select public.is_active_user()) and student_id = (select auth.uid()))
    or student_id in (select public.visible_student_ids())
    or item_id in (select public.created_item_ids())
  );

-- No insert/update/delete policies: admin and principal included, nobody writes directly.
