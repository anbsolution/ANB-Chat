-- ANB Chat v1.3.0: profile fields for password signup.
-- Run in Supabase SQL Editor before testing signup/mobile login.
alter table public.profiles
  add column if not exists full_name text,
  add column if not exists mobile text,
  add column if not exists invite_id text;

create unique index if not exists profiles_mobile_unique
  on public.profiles (mobile)
  where mobile is not null and length(trim(mobile)) > 0;
