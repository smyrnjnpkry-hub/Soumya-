-- Optional cloud sync for Idea Vault. Run in the Supabase SQL editor or with
-- `supabase db push`. Every row is private to its owner via Row Level Security.

create table if not exists public.notes (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default '',
  body text not null default '',
  kind text not null default 'idea',
  tags text[] not null default '{}',
  source_id uuid,
  created_at timestamptz not null,
  updated_at timestamptz not null,       -- client edit time (last-write-wins)
  deleted_at timestamptz,                -- tombstone so deletes sync
  server_updated_at timestamptz not null default now()  -- pull cursor
);

create index if not exists notes_user_server_updated_idx
  on public.notes (user_id, server_updated_at);

-- Bump the pull cursor on every write so other devices see the change.
create or replace function public.notes_touch_server_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.server_updated_at := now();
  return new;
end;
$$;

drop trigger if exists notes_touch on public.notes;
create trigger notes_touch
  before insert or update on public.notes
  for each row execute function public.notes_touch_server_updated_at();

alter table public.notes enable row level security;

drop policy if exists "notes: owner can read" on public.notes;
create policy "notes: owner can read" on public.notes
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "notes: owner can insert" on public.notes;
create policy "notes: owner can insert" on public.notes
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "notes: owner can update" on public.notes;
create policy "notes: owner can update" on public.notes
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "notes: owner can delete" on public.notes;
create policy "notes: owner can delete" on public.notes
  for delete to authenticated using ((select auth.uid()) = user_id);
