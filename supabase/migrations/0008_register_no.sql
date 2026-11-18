-- Register numbers: students sign in with their email or register number plus a password.
-- Stored upper-case by the app; unique ignoring case. Only students have one.
alter table public.profiles add column register_no text;

alter table public.profiles
  add constraint profiles_register_no_format
  check (register_no is null or register_no ~ '^[A-Za-z0-9/-]{3,30}$');

alter table public.profiles
  add constraint profiles_register_no_students_only
  check (register_no is null or role = 'student');

create unique index profiles_register_no_key on public.profiles (upper(register_no)) where register_no is not null;
