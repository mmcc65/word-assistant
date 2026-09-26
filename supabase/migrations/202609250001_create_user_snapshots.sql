create table if not exists public.user_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.user_snapshots enable row level security;
revoke all on table public.user_snapshots from anon, authenticated;
grant select, insert, update, delete on table public.user_snapshots to authenticated;

create policy "Users can read their own snapshot"
on public.user_snapshots for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their own snapshot"
on public.user_snapshots for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own snapshot"
on public.user_snapshots for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own snapshot"
on public.user_snapshots for delete
to authenticated
using ((select auth.uid()) = user_id);
