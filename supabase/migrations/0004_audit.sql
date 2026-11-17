-- Task 5: audit log.
--
-- Rules (spec Decision 11 and "Builder's calls"):
--   * every change (confirmations, revisions, link changes, role changes) is logged by row
--     triggers; proof views and profile opens are logged from the app (lib/audit.ts);
--   * the log is append-only for everyone: no UPDATE/DELETE/TRUNCATE privilege for any API
--     role, and guard triggers reject UPDATE/DELETE/TRUNCATE even for the table owner;
--   * only the principal and admin (active) can read it;
--   * privacy: result text (outcome, details, proof_path, review_note), item text (title,
--     description, meeting_url), emails and names never enter the log. `detail` holds ids,
--     changed column NAMES, and old/new values for a per-table whitelist of non-sensitive
--     columns only.
--
-- detail shape (written by public.audit_row_change):
--   insert: {"row": {<key cols>, <whitelisted value cols>}}
--   update: {"row": {<key cols>}, "changed": [<every changed column name>],
--            "old": {<changed whitelisted cols>}, "new": {<changed whitelisted cols>}}
--   delete: {"row": {<key cols>}}

-- ------------------------------------------------------------------ table

create table public.audit_log (
  id        bigserial primary key,
  at        timestamptz not null default now(),
  actor_id  uuid,                         -- null for server-side / maintenance writes
  action    text not null check (btrim(action) <> ''),
  entity    text not null check (btrim(entity) <> ''),
  entity_id text not null,
  detail    jsonb not null default '{}'::jsonb
);

create index audit_log_entity_idx on public.audit_log (entity, entity_id);
create index audit_log_actor_idx on public.audit_log (actor_id);

-- ------------------------------------------------------------------ append-only guard
-- Fires for every role including the owner and superusers (short of disabling triggers).
create function public.audit_log_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log is append-only (% not allowed)', tg_op using errcode = '42501';
end;
$$;

revoke execute on function public.audit_log_immutable() from public, anon, authenticated, service_role;

create trigger audit_log_no_update_delete
  before update or delete on public.audit_log
  for each row execute function public.audit_log_immutable();

create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function public.audit_log_immutable();

-- ------------------------------------------------------------------ change trigger
-- Generic row trigger. Arguments:
--   tg_argv[0]  comma-separated key columns, always recorded; the first one is entity_id
--   tg_argv[1]  comma-separated non-sensitive value columns whose values may be recorded
-- Any other column is recorded by name only (in "changed") and never by value.
-- No-op updates (nothing changed) are skipped. actor_id = auth.uid(), null when absent.
create function public.audit_row_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_keys    text[] := string_to_array(coalesce(tg_argv[0], ''), ',');
  v_values  text[] := string_to_array(coalesce(tg_argv[1], ''), ',');
  v_old     jsonb;
  v_new     jsonb;
  v_src     jsonb;
  v_changed text[];
  v_detail  jsonb;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_old := to_jsonb(old);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new := to_jsonb(new);
  end if;
  v_src := coalesce(v_new, v_old);

  if tg_op = 'UPDATE' then
    select coalesce(array_agg(k order by k), '{}') into v_changed
    from jsonb_object_keys(v_new) k
    where (v_new -> k) is distinct from (v_old -> k);

    if cardinality(v_changed) = 0 then
      return null;   -- no-op update
    end if;

    v_detail := jsonb_build_object(
      'row',     (select coalesce(jsonb_object_agg(k, v_new -> k), '{}'::jsonb)
                  from unnest(v_keys) k),
      'changed', to_jsonb(v_changed),
      'old',     (select coalesce(jsonb_object_agg(k, v_old -> k), '{}'::jsonb)
                  from unnest(v_values) k where k = any (v_changed)),
      'new',     (select coalesce(jsonb_object_agg(k, v_new -> k), '{}'::jsonb)
                  from unnest(v_values) k where k = any (v_changed)));
  elsif tg_op = 'INSERT' then
    v_detail := jsonb_build_object(
      'row', (select coalesce(jsonb_object_agg(k, v_new -> k), '{}'::jsonb)
              from unnest(v_keys || v_values) k));
  else
    v_detail := jsonb_build_object(
      'row', (select coalesce(jsonb_object_agg(k, v_old -> k), '{}'::jsonb)
              from unnest(v_keys) k));
  end if;

  insert into public.audit_log (actor_id, action, entity, entity_id, detail)
  values ((select auth.uid()),
          lower(tg_op),
          tg_table_name,
          coalesce(v_src ->> v_keys[1], ''),
          coalesce(v_detail, '{}'::jsonb));

  return null;   -- AFTER trigger
end;
$$;

-- Triggers do not need caller EXECUTE rights.
revoke execute on function public.audit_row_change() from public, anon, authenticated, service_role;

-- results: ids and statuses only; never outcome, details, proof_path, review_note.
create trigger audit_results
  after insert or update or delete on public.results
  for each row execute function public.audit_row_change(
    'id,invitation_id,revision', 'status,confirmed_by,confirmed_at,submitted_at');

-- items: never title, description, meeting_url.
create trigger audit_items
  after insert or update or delete on public.items
  for each row execute function public.audit_row_change(
    'id,created_by', 'type,starts_at,deadline,requires_confirmation,requires_proof,created_at');

create trigger audit_invitations
  after insert or update or delete on public.invitations
  for each row execute function public.audit_row_change(
    'id,item_id,student_id', 'status,responded_at');

-- profiles: never email, full_name.
create trigger audit_profiles
  after insert or update or delete on public.profiles
  for each row execute function public.audit_row_change('id', 'role,active');

-- departments / groups: names are recorded by column name only.
create trigger audit_departments
  after insert or update or delete on public.departments
  for each row execute function public.audit_row_change('id', '');

create trigger audit_groups
  after insert or update or delete on public.groups
  for each row execute function public.audit_row_change('id', '');

create trigger audit_student_year
  after insert or update or delete on public.student_year
  for each row execute function public.audit_row_change('student_id', 'year');

create trigger audit_department_memberships
  after insert or update or delete on public.department_memberships
  for each row execute function public.audit_row_change(
    'id,student_id,department_id', 'valid_from,valid_to');

create trigger audit_hod_assignments
  after insert or update or delete on public.hod_assignments
  for each row execute function public.audit_row_change(
    'id,faculty_id,department_id', 'valid_from,valid_to');

create trigger audit_group_members
  after insert or update or delete on public.group_members
  for each row execute function public.audit_row_change(
    'id,group_id,student_id', 'valid_from,valid_to');

create trigger audit_group_leads
  after insert or update or delete on public.group_leads
  for each row execute function public.audit_row_change(
    'id,group_id,faculty_id', 'valid_from,valid_to');

create trigger audit_mentorships
  after insert or update or delete on public.mentorships
  for each row execute function public.audit_row_change(
    'id,mentor_id,student_id', 'valid_from,valid_to');

-- ------------------------------------------------------------------ privileges and RLS

alter table public.audit_log enable row level security;

revoke all on public.audit_log from public, anon, authenticated, service_role;
revoke all on sequence public.audit_log_id_seq from public, anon, authenticated, service_role;

-- reads: RLS limits authenticated to the active principal and admin
grant select on public.audit_log to authenticated;
-- appends from the app (lib/audit.ts: proof views, profile opens) go through service_role
grant insert on public.audit_log to service_role;
grant usage on sequence public.audit_log_id_seq to service_role;

create policy audit_select on public.audit_log
  for select to authenticated
  using ((select public.current_role_of()) in ('principal', 'admin'));

-- No insert/update/delete policies: nothing is ever edited through the API.
