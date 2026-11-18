-- Event suggestions: hackathons and internships collected from the opportunity sheets.
--
-- These are only suggestions. They are not events and nobody is invited to them. A faculty member browses them on the
-- New event page, picks one to prefill the form, chooses the audience, and posts a real event through create_item.
-- Rows are loaded by the import script with the server-side key; the app only reads them.

create table public.event_suggestions (
  id         uuid primary key default gen_random_uuid(),
  kind       public.item_type not null check (kind in ('hackathon', 'internship')),
  title      text not null check (btrim(title) <> ''),
  organiser  text,
  description text,
  link       text,                 -- registration or application page
  deadline   timestamptz,          -- null when rolling or unknown
  priority   text,                 -- e.g. "Tier S", "Elite": sheet's own ranking, for sorting
  source_key text not null unique, -- stable id from the sheet row, so re-imports update instead of duplicating
  created_at timestamptz not null default now()
);

alter table public.event_suggestions enable row level security;
revoke all on public.event_suggestions from anon;
revoke insert, update, delete, truncate on public.event_suggestions from authenticated;
grant select on public.event_suggestions to authenticated;

-- Active faculty (anyone who can post events) and the admin and principal read; students never do.
create policy event_suggestions_select on public.event_suggestions
  for select to authenticated
  using ((select public.current_role_of()) in ('faculty', 'admin', 'principal'));
