-- Explicit owner-only backups. Caregiver event synchronization is separate.
create table public.baby_backups (
 baby_id uuid primary key references public.babies(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object' and octet_length(snapshot::text)<=2000000),
 updated_at timestamptz not null default now()
);
alter table public.baby_backups enable row level security;
create policy backups_owner_read on public.baby_backups for select to authenticated
 using(user_id=auth.uid() and public.owns_baby(baby_id));
create policy backups_owner_insert on public.baby_backups for insert to authenticated
 with check(user_id=auth.uid() and public.owns_baby(baby_id));
create policy backups_owner_update on public.baby_backups for update to authenticated
 using(user_id=auth.uid() and public.owns_baby(baby_id))
 with check(user_id=auth.uid() and public.owns_baby(baby_id));
create policy backups_owner_delete on public.baby_backups for delete to authenticated
 using(user_id=auth.uid() and public.owns_baby(baby_id));
revoke all on public.baby_backups from anon;
grant select,insert,update,delete on public.baby_backups to authenticated;
