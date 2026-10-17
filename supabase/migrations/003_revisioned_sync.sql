-- Run after 001 and 002. Snapshot sync remains owner-only.
alter table public.baby_backups add column revision bigint not null default 1;
create function public.backup_revision() returns trigger language plpgsql set search_path='' as $$
begin
 if new.baby_id<>old.baby_id or new.user_id<>old.user_id then raise exception 'Backup ownership is immutable'; end if;
 new.revision=old.revision+1;new.updated_at=now();return new;
end;$$;
create trigger backup_revision before update on public.baby_backups for each row execute function public.backup_revision();
create function public.save_baby_snapshot(target_baby uuid,expected_revision bigint,new_snapshot jsonb)
returns table(revision bigint) language sql security invoker set search_path='' as $$
 update public.baby_backups b set snapshot=new_snapshot
 where b.baby_id=target_baby and b.user_id=auth.uid() and b.revision=expected_revision
 returning b.revision;
$$;
revoke all on function public.save_baby_snapshot(uuid,bigint,jsonb) from public,anon;
grant execute on function public.save_baby_snapshot(uuid,bigint,jsonb) to authenticated;
