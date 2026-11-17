-- Task 11: dashboard counts.
--
-- Both views are security_invoker, so they read items, invitations and results as the caller and
-- row-level security decides which students appear: a head of department gets their department,
-- the principal gets everyone, a student only themself, the admin nothing.
--
-- Confirmed and claimed are deliberately separate views (spec anti-goal: never mix them):
--   confirmed_results_by_student   one row per student and item type, counting invitations whose
--                                  result is confirmed. A confirmed result with a pending correction
--                                  counts once, here, until the correction is confirmed (then the new
--                                  value replaces it; one confirmed row per invitation is enforced).
--   unconfirmed_claims_by_student  invitations whose only live result is submitted and has never been
--                                  confirmed. A pending correction on an already-confirmed result is
--                                  not a new claim. Sent-back results are in neither view.

create view public.confirmed_results_by_student
with (security_invoker = true) as
select inv.student_id,
       it.type as item_type,
       count(*) as count
from public.results r
join public.invitations inv on inv.id = r.invitation_id
join public.items it on it.id = inv.item_id
where r.status = 'confirmed'
group by inv.student_id, it.type;

create view public.unconfirmed_claims_by_student
with (security_invoker = true) as
select inv.student_id,
       it.type as item_type,
       count(*) as count
from public.results r
join public.invitations inv on inv.id = r.invitation_id
join public.items it on it.id = inv.item_id
where r.status = 'submitted'
  and not exists (
    select 1 from public.results c
    where c.invitation_id = r.invitation_id and c.status = 'confirmed'
  )
group by inv.student_id, it.type;

revoke all on public.confirmed_results_by_student, public.unconfirmed_claims_by_student from public, anon;
grant select on public.confirmed_results_by_student, public.unconfirmed_claims_by_student to authenticated;
