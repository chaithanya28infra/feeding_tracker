-- Run once after 001–003. Invitations explicitly share the selected baby's snapshot.
create table public.caregiver_invites (
 id uuid primary key default gen_random_uuid(),
 baby_id uuid not null references public.babies on delete cascade,
 invited_email text not null check(length(invited_email) between 3 and 254),
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 created_by uuid not null references auth.users,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '7 days',
 accepted_by uuid references auth.users,
 accepted_at timestamptz, revoked_at timestamptz
);
create index caregiver_invites_baby_idx on public.caregiver_invites(baby_id);
alter table public.caregiver_invites enable row level security;
create policy invites_owner_read on public.caregiver_invites for select to authenticated using(public.owns_baby(baby_id));
revoke all on public.caregiver_invites from anon,authenticated;
grant select on public.caregiver_invites to authenticated;

create function public.create_caregiver_invite(target_baby uuid,recipient_email text,invite_hash text)
returns table(invite_id uuid,expires_at timestamptz) language plpgsql security definer set search_path='' as $$
declare recipient text:=lower(trim(recipient_email));begin
 if auth.uid() is null or not public.owns_baby(target_baby) then raise exception 'Only the baby owner can invite caregivers';end if;
 perform 1 from public.babies where id=target_baby for update;
 if not exists(select 1 from public.baby_backups where baby_id=target_baby) then raise exception 'Make a cloud backup before inviting a caregiver';end if;
 if length(recipient)>254 or recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or invite_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid invitation';end if;
 if recipient=(select lower(email) from auth.users where id=auth.uid()) then raise exception 'You already own this baby profile';end if;
 if exists(select 1 from public.baby_caregivers c join auth.users u on u.id=c.user_id where c.baby_id=target_baby and lower(u.email)=recipient) then raise exception 'This person is already a caregiver';end if;
 if exists(select 1 from public.caregiver_invites i where i.baby_id=target_baby and i.invited_email=recipient and i.revoked_at is null and i.accepted_at is null and i.expires_at>now()) then raise exception 'An active invite already exists. Revoke it before creating another';end if;
 if (select count(*) from public.caregiver_invites i where i.baby_id=target_baby and i.revoked_at is null and i.accepted_at is null and i.expires_at>now())>=10 then raise exception 'Revoke an existing invitation first';end if;
 return query insert into public.caregiver_invites(baby_id,invited_email,token_hash,created_by) values(target_baby,recipient,invite_hash,auth.uid()) returning id,caregiver_invites.expires_at;
end;$$;

create function public.accept_caregiver_invite(invite_hash text) returns uuid language plpgsql security definer set search_path='' as $$
declare invite public.caregiver_invites%rowtype;recipient text;confirmed timestamptz;begin
 if auth.uid() is null then raise exception 'Sign in before accepting an invite';end if;
 select email,email_confirmed_at into recipient,confirmed from auth.users where id=auth.uid();
 select * into invite from public.caregiver_invites i where i.token_hash=invite_hash;
 if not found then raise exception 'Invite unavailable. Check the signed-in email, expiry, or ask the owner for a new link';end if;
 -- Serialize acceptance and removal for this baby before locking the invite row.
 perform 1 from public.babies where id=invite.baby_id for update;
 select * into invite from public.caregiver_invites i where i.token_hash=invite_hash for update;
 if not found or confirmed is null or lower(recipient)<>invite.invited_email or invite.revoked_at is not null or invite.accepted_at is not null or invite.expires_at<=now() then raise exception 'Invite unavailable. Check the signed-in email, expiry, or ask the owner for a new link';end if;
 insert into public.baby_caregivers(baby_id,user_id,role) values(invite.baby_id,auth.uid(),'caregiver') on conflict(baby_id,user_id) do nothing;
 update public.caregiver_invites set accepted_at=now(),accepted_by=auth.uid() where id=invite.id;
 return invite.baby_id;
end;$$;

create function public.revoke_caregiver_invite(target_invite uuid) returns void language plpgsql security definer set search_path='' as $$
declare invite public.caregiver_invites%rowtype;begin
 select * into invite from public.caregiver_invites where id=target_invite for update;
 if not found or not public.owns_baby(invite.baby_id) then raise exception 'Owner access required';end if;
 if invite.accepted_at is not null then raise exception 'Invite already accepted. Remove the caregiver from the care team instead';end if;
 update public.caregiver_invites set revoked_at=now() where id=target_invite;
end;$$;
create function public.remove_baby_caregiver(target_baby uuid,target_user uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.owns_baby(target_baby) or target_user=auth.uid() then raise exception 'Owner access required; the owner cannot be removed';end if;
 perform 1 from public.babies where id=target_baby for update;
 delete from public.baby_caregivers where baby_id=target_baby and user_id=target_user and role='caregiver';
 update public.caregiver_invites set revoked_at=now() where baby_id=target_baby and invited_email=(select lower(email) from auth.users where id=target_user) and revoked_at is null;
end;$$;
create function public.list_baby_caregivers(target_baby uuid)
returns table(user_id uuid,display_name text,role text) language plpgsql stable security definer set search_path='' as $$
begin
 if not public.can_access_baby(target_baby) then raise exception 'Baby access required';end if;
 return query select b.owner_id,coalesce(nullif(p.display_name,''),split_part(u.email,'@',1),'Parent'),'owner'::text from public.babies b join auth.users u on u.id=b.owner_id left join public.profiles p on p.id=b.owner_id where b.id=target_baby
 union all select c.user_id,coalesce(nullif(p.display_name,''),split_part(u.email,'@',1),'Caregiver'),'caregiver'::text from public.baby_caregivers c join public.babies b on b.id=c.baby_id join auth.users u on u.id=c.user_id left join public.profiles p on p.id=c.user_id where c.baby_id=target_baby and c.user_id<>b.owner_id;
end;$$;
revoke all on function public.create_caregiver_invite(uuid,text,text),public.accept_caregiver_invite(text),public.revoke_caregiver_invite(uuid),public.remove_baby_caregiver(uuid,uuid),public.list_baby_caregivers(uuid) from public,anon;
grant execute on function public.create_caregiver_invite(uuid,text,text),public.accept_caregiver_invite(text),public.revoke_caregiver_invite(uuid),public.remove_baby_caregiver(uuid,uuid),public.list_baby_caregivers(uuid) to authenticated;

-- Membership now authorizes shared care snapshot reads and revisioned updates.
-- Backup creation/deletion remain owner-only.
drop policy backups_owner_read on public.baby_backups;
drop policy backups_owner_update on public.baby_backups;
create policy backups_family_read on public.baby_backups for select to authenticated using(public.can_access_baby(baby_id));
create policy backups_family_update on public.baby_backups for update to authenticated using(public.can_access_baby(baby_id)) with check(public.can_access_baby(baby_id));

create function public.attribute_care_events(previous_snapshot jsonb,next_snapshot jsonb,actor uuid,actor_name text) returns jsonb language plpgsql set search_path='' as $$
declare entry jsonb;prior jsonb;events jsonb:='[]';content jsonb;old_content jsonb;begin
 if jsonb_typeof(coalesce(next_snapshot->'events','[]'))<>'array' then raise exception 'Events must be an array';end if;
 for entry in select value from jsonb_array_elements(coalesce(next_snapshot->'events','[]')) loop
  select value into prior from jsonb_array_elements(coalesce(previous_snapshot->'events','[]')) where value->>'id'=entry->>'id' limit 1;
  content=entry-array['createdBy','createdByName','updatedBy','updatedByName'];
  old_content=prior-array['createdBy','createdByName','updatedBy','updatedByName'];
  if prior is null then
   entry=content||jsonb_build_object('createdBy',actor,'createdByName',actor_name,'updatedBy',actor,'updatedByName',actor_name);
  elsif content=old_content then entry=prior;
  else
   entry=content||jsonb_strip_nulls(jsonb_build_object('createdBy',prior->>'createdBy','createdByName',prior->>'createdByName','updatedBy',actor,'updatedByName',actor_name));
  end if;
  events=events||jsonb_build_array(entry);
 end loop;
 return jsonb_set(next_snapshot,'{events}',events);
end;$$;
revoke all on function public.attribute_care_events(jsonb,jsonb,uuid,text) from public,anon;
grant execute on function public.attribute_care_events(jsonb,jsonb,uuid,text) to authenticated;
create or replace function public.backup_revision() returns trigger language plpgsql set search_path='' as $$
declare actor_name text;begin
 if new.baby_id<>old.baby_id or new.user_id<>old.user_id then raise exception 'Backup ownership is immutable';end if;
 select coalesce(nullif(p.display_name,''),'Caregiver') into actor_name from public.profiles p where p.id=auth.uid();
 new.snapshot=public.attribute_care_events(old.snapshot,new.snapshot,auth.uid(),coalesce(actor_name,'Caregiver'));
 new.revision=old.revision+1;new.updated_at=now();return new;
end;$$;
drop function public.save_baby_snapshot(uuid,bigint,jsonb);
create function public.save_baby_snapshot(target_baby uuid,expected_revision bigint,new_snapshot jsonb)
returns table(revision bigint,snapshot jsonb) language sql security invoker set search_path='' as $$
 update public.baby_backups b set snapshot=new_snapshot
 where b.baby_id=target_baby and public.can_access_baby(b.baby_id) and b.revision=expected_revision
 returning b.revision,b.snapshot;
$$;
revoke all on function public.save_baby_snapshot(uuid,bigint,jsonb) from public,anon;
grant execute on function public.save_baby_snapshot(uuid,bigint,jsonb) to authenticated;
