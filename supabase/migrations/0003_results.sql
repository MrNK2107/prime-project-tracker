-- Task 4: results, confirmation and revisions.
--
-- Rules (spec Decisions 6, 7, 8, 9 and "Builder's calls"):
--   * a joined student submits a result (outcome, details, optional proof path; proof is
--     required when the item says so);
--   * items that require confirmation start as 'submitted'; the item's creator or the
--     student's mentor (active right now, checked at the moment of confirming) confirms
--     or sends it back with a note; confirmed_by records who confirmed;
--   * items that do not require confirmation are stored 'confirmed' with confirmed_by null;
--   * a confirmed result is locked. A correction is a new revision ('submitted'); the old
--     confirmed row keeps counting until the correction is confirmed, then it becomes
--     'superseded'. Corrections always go through review, even on auto-confirm items;
--   * results are never deleted; the history of revisions stays;
--   * no direct writes: results are written only by submit_result, review_result and
--     request_correction (security definer). Principal reads all, admin reads none.

create type public.result_status as enum ('submitted', 'sent_back', 'confirmed', 'superseded');

-- ------------------------------------------------------------------ table

create table public.results (
  id            uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.invitations (id),
  revision      int not null check (revision >= 1),
  outcome       text not null check (btrim(outcome) <> ''),
  details       text,
  proof_path    text,                 -- object path in storage (Task 6); just text here
  status        public.result_status not null default 'submitted',
  review_note   text,
  confirmed_by  uuid references public.profiles (id),
  confirmed_at  timestamptz,
  submitted_at  timestamptz not null default now(),
  constraint results_invitation_revision_key unique (invitation_id, revision),
  -- confirmed_at is set exactly for rows that were confirmed (superseded rows were confirmed)
  constraint results_confirmed_at_check
    check ((status in ('confirmed', 'superseded')) = (confirmed_at is not null)),
  constraint results_sent_back_note_check
    check (status <> 'sent_back' or btrim(coalesce(review_note, '')) <> '')
);

-- At most one counting (confirmed) value per invitation. Dashboards count the confirmed
-- row per invitation; (invitation_id, revision) is served by the unique constraint above.
create unique index results_one_confirmed_idx on public.results (invitation_id)
  where status = 'confirmed';

-- ------------------------------------------------------------------ lock trigger
-- Defense in depth (users have no UPDATE/DELETE privilege on results at all):
--   * DELETE is always rejected, history is never destroyed;
--   * a confirmed row may only change status -> 'superseded' with nothing else changed,
--     and only while review_result has set the transaction-local app.allow_supersede;
--   * sent_back and superseded rows are final.
create function public.results_lock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'results are never deleted' using errcode = '42501';
  end if;

  if old.status = 'confirmed' then
    if new.status = 'superseded'
       and (to_jsonb(new) - 'status') = (to_jsonb(old) - 'status')
       and coalesce(current_setting('app.allow_supersede', true), '') = 'on' then
      return new;
    end if;
    raise exception 'confirmed results are locked' using errcode = '42501';
  end if;

  if old.status in ('sent_back', 'superseded') then
    raise exception '% results are final', old.status using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function public.results_lock() from public, anon, authenticated, service_role;

create trigger results_lock
  before update or delete on public.results
  for each row execute function public.results_lock();

-- ------------------------------------------------------------------ submit_result
-- Invited, active student; invitation must be 'joined'. Allowed when the invitation has no
-- result yet, or its latest revision was sent back (the new revision is n+1). A latest
-- revision that is submitted or confirmed blocks it (use request_correction for confirmed).
-- Auto-confirms when the item does not require confirmation, unless an earlier confirmed
-- row exists (then this is a resubmitted correction and goes to review).
create function public.submit_result(
  p_invitation_id uuid,
  p_outcome       text,
  p_details       text,
  p_proof_path    text
)
returns uuid
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_uid           uuid := (select auth.uid());
  v_inv_status    public.invitation_status;
  v_requires_conf boolean;
  v_requires_proof boolean;
  v_proof         text := nullif(btrim(coalesce(p_proof_path, '')), '');
  v_last_rev      int;
  v_last_status   public.result_status;
  v_auto          boolean;
  v_id            uuid;
begin
  select inv.status, i.requires_confirmation, i.requires_proof
    into v_inv_status, v_requires_conf, v_requires_proof
  from public.invitations inv
  join public.items i on i.id = inv.item_id
  where inv.id = p_invitation_id
    and inv.student_id = v_uid
    and (select public.current_role_of()) = 'student'
  for update of inv;   -- serializes revisions of this invitation

  if not found then
    -- same error whether the invitation is missing or belongs to someone else
    raise exception 'invitation not found' using errcode = '42501';
  end if;

  if v_inv_status <> 'joined' then
    raise exception 'only a joined invitation can have a result' using errcode = '22023';
  end if;
  if btrim(coalesce(p_outcome, '')) = '' then
    raise exception 'outcome must not be empty' using errcode = '22023';
  end if;
  if v_requires_proof and v_proof is null then
    raise exception 'this item requires a proof file' using errcode = '22023';
  end if;

  select r.revision, r.status into v_last_rev, v_last_status
  from public.results r
  where r.invitation_id = p_invitation_id
  order by r.revision desc
  limit 1;

  if v_last_rev is not null and v_last_status <> 'sent_back' then
    raise exception 'a result already exists (status %); request a correction instead', v_last_status
      using errcode = '22023';
  end if;

  v_auto := not v_requires_conf
            and not exists (select 1 from public.results r
                            where r.invitation_id = p_invitation_id and r.status = 'confirmed');

  insert into public.results (invitation_id, revision, outcome, details, proof_path,
                              status, confirmed_by, confirmed_at)
  values (p_invitation_id, coalesce(v_last_rev, 0) + 1, p_outcome, p_details, v_proof,
          case when v_auto then 'confirmed' else 'submitted' end::public.result_status,
          null,
          case when v_auto then now() end)
  returning id into v_id;

  return v_id;
end;
$$;

-- ------------------------------------------------------------------ review_result
-- Confirm or send back a 'submitted' result. Caller: active faculty who is the item's
-- creator or the student's mentor right now (HOD, group lead, principal, admin and the
-- student cannot). Confirming a correction supersedes the earlier confirmed row; this is
-- the only path that may modify a confirmed row.
create function public.review_result(p_result_id uuid, p_decision text, p_note text)
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
             or exists (select 1 from public.mentorships m
                        where m.mentor_id = v_uid and m.student_id = v_student
                          and m.valid_from <= current_date
                          and (m.valid_to is null or m.valid_to >= current_date))) then
    -- same error whether the result is missing or the caller has no authority
    raise exception 'only the item creator or the student''s current mentor can review'
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

-- ------------------------------------------------------------------ request_correction
-- The owning (active) student, on the invitation's latest revision when it is 'confirmed'.
-- Inserts revision n+1 as 'submitted' (always reviewed, even on auto-confirm items). A
-- later revision (pending or sent back correction) blocks it.
create function public.request_correction(
  p_result_id  uuid,
  p_outcome    text,
  p_details    text,
  p_proof_path text
)
returns uuid
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_uid            uuid := (select auth.uid());
  v_inv_id         uuid;
  v_revision       int;
  v_status         public.result_status;
  v_requires_proof boolean;
  v_proof          text := nullif(btrim(coalesce(p_proof_path, '')), '');
  v_id             uuid;
begin
  select r.invitation_id, r.revision, r.status, i.requires_proof
    into v_inv_id, v_revision, v_status, v_requires_proof
  from public.results r
  join public.invitations inv on inv.id = r.invitation_id
  join public.items i on i.id = inv.item_id
  where r.id = p_result_id
    and inv.student_id = v_uid
    and (select public.current_role_of()) = 'student'
  for update of inv;

  if not found then
    raise exception 'result not found' using errcode = '42501';
  end if;

  if v_status <> 'confirmed'
     or exists (select 1 from public.results r
                where r.invitation_id = v_inv_id and r.revision > v_revision) then
    raise exception 'only the latest confirmed result can be corrected' using errcode = '22023';
  end if;
  if btrim(coalesce(p_outcome, '')) = '' then
    raise exception 'outcome must not be empty' using errcode = '22023';
  end if;
  if v_requires_proof and v_proof is null then
    raise exception 'this item requires a proof file' using errcode = '22023';
  end if;

  insert into public.results (invitation_id, revision, outcome, details, proof_path, status)
  values (v_inv_id, v_revision + 1, p_outcome, p_details, v_proof, 'submitted')
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.submit_result(uuid, text, text, text) from public, anon, service_role;
revoke execute on function public.review_result(uuid, text, text) from public, anon, service_role;
revoke execute on function public.request_correction(uuid, text, text, text) from public, anon, service_role;
grant execute on function public.submit_result(uuid, text, text, text) to authenticated;
grant execute on function public.review_result(uuid, text, text) to authenticated;
grant execute on function public.request_correction(uuid, text, text, text) to authenticated;

-- ------------------------------------------------------------------ RLS

alter table public.results enable row level security;

revoke all on public.results from anon;
-- writes only through the security definer functions above
revoke insert, update, delete, truncate on public.results from authenticated;
grant select on public.results to authenticated;

-- Readable by whoever can see the student (self, mentor, group lead, HOD, principal) and by
-- the item's creator. Own results first (indexable via invitations_student_idx), then
-- semi-joins against the set-returning helpers. Admin matches none of these.
create policy results_select on public.results
  for select to authenticated
  using (
    invitation_id in (select inv.id from public.invitations inv
                      where inv.student_id = (select auth.uid())
                        and (select public.is_active_user()))
    or invitation_id in (select inv.id from public.invitations inv
                         where inv.student_id in (select public.visible_student_ids()))
    or invitation_id in (select inv.id from public.invitations inv
                         where inv.item_id in (select public.created_item_ids()))
  );

-- No insert/update/delete policies: admin and principal included, nobody writes directly.
