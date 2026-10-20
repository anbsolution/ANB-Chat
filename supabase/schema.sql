-- ANB Chat schema v0.2. Run in Supabase SQL Editor.
-- Re-runnable: policies are dropped before recreation.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  username text unique check (username is null or username = lower(username)),
  public_key text,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  ciphertext text not null,
  created_at timestamptz not null default now(),
  constraint messages_not_self check (sender_id <> recipient_id),
  constraint messages_ciphertext_size check (char_length(ciphertext) between 1 and 3000000)
);

create table if not exists public.call_signals (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  call_id uuid not null,
  signal_type text not null check (signal_type in ('offer','answer','ice','hangup','reject')),
  payload jsonb,
  created_at timestamptz not null default now(),
  constraint call_signals_not_self check (from_user <> to_user),
  constraint call_signals_payload_size check (octet_length(coalesce(payload::text, 'null')) <= 250000)
);

-- Add payload limits to databases created by earlier schema versions too.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'messages_ciphertext_size' and conrelid = 'public.messages'::regclass) then
    alter table public.messages add constraint messages_ciphertext_size check (char_length(ciphertext) between 1 and 3000000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'call_signals_payload_size' and conrelid = 'public.call_signals'::regclass) then
    alter table public.call_signals add constraint call_signals_payload_size check (octet_length(coalesce(payload::text, 'null')) <= 250000);
  end if;
end $$;

create unique index if not exists profiles_username_lower_unique on public.profiles (lower(username)) where username is not null;

create index if not exists messages_conversation_created_idx on public.messages (sender_id, recipient_id, created_at);
create index if not exists call_signals_recipient_created_idx on public.call_signals (to_user, created_at);

alter table public.profiles enable row level security;
alter table public.messages enable row level security;
alter table public.call_signals enable row level security;

drop policy if exists "Profiles visible to signed-in users" on public.profiles;
drop policy if exists "Users can create their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;
drop policy if exists "Participants can read their messages" on public.messages;
drop policy if exists "Sender can send messages as self" on public.messages;
drop policy if exists "Call participants can read signals" on public.call_signals;
drop policy if exists "Call participants can create signals as self" on public.call_signals;
drop policy if exists "Call participants can delete signals" on public.call_signals;

create policy "Profiles visible to signed-in users" on public.profiles
  for select to authenticated using (true);
create policy "Users can create their own profile" on public.profiles
  for insert to authenticated with check (auth.uid() = id);
create policy "Users can update their own profile" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
create policy "Participants can read their messages" on public.messages
  for select to authenticated using (auth.uid() = sender_id or auth.uid() = recipient_id);
create policy "Sender can send messages as self" on public.messages
  for insert to authenticated with check (auth.uid() = sender_id and sender_id <> recipient_id);
create policy "Call participants can read signals" on public.call_signals
  for select to authenticated using (auth.uid() = from_user or auth.uid() = to_user);
create policy "Call participants can create signals as self" on public.call_signals
  for insert to authenticated with check (auth.uid() = from_user and from_user <> to_user);
create policy "Call participants can delete signals" on public.call_signals
  for delete to authenticated using (auth.uid() = from_user or auth.uid() = to_user);

-- Enable Realtime for public.messages and public.call_signals in the Supabase dashboard.
-- Production: restrict profile field exposure; add abuse controls, retention policies and reviewed call signaling.

-- Private encrypted attachment storage. The client encrypts file bytes before upload.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('anb-chat-attachments', 'anb-chat-attachments', false, 22020096, array['application/octet-stream'])
on conflict (id) do update set public = false, file_size_limit = 22020096, allowed_mime_types = array['application/octet-stream'];

drop policy if exists "ANB attachment sender uploads" on storage.objects;
drop policy if exists "ANB conversation participants download attachments" on storage.objects;
drop policy if exists "ANB attachment sender deletes" on storage.objects;
create policy "ANB attachment sender uploads" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'anb-chat-attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "ANB conversation participants download attachments" on storage.objects
  for select to authenticated
  using (bucket_id = 'anb-chat-attachments' and ((storage.foldername(name))[1] = auth.uid()::text or (storage.foldername(name))[2] = auth.uid()::text));
create policy "ANB attachment sender deletes" on storage.objects
  for delete to authenticated
  using (bucket_id = 'anb-chat-attachments' and (storage.foldername(name))[1] = auth.uid()::text);
