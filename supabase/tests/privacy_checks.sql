-- Run in Supabase SQL Editor after migrations 001–003.
-- Test fixtures and updates roll back; use a staging project first.
begin;
insert into auth.users(id,email) values
 ('11111111-1111-4111-8111-111111111111','privacy-a@example.test'),
 ('22222222-2222-4222-8222-222222222222','privacy-b@example.test'),
 ('33333333-3333-4333-8333-333333333333','privacy-caregiver@example.test');
insert into public.babies(id,owner_id,name,date_of_birth) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','Privacy test A','2026-01-01'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','Privacy test B','2026-01-01'),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','22222222-2222-4222-8222-222222222222','Privacy test B second','2026-01-01');
insert into public.baby_caregivers(baby_id,user_id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333');
insert into public.baby_backups(baby_id,user_id,snapshot) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','{}'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','{}');
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
do $$ declare n integer;begin
 if (select count(*) from public.babies)<>1 then raise exception 'FAIL: baby isolation';end if;
 if (select count(*) from public.baby_backups)<>1 then raise exception 'FAIL: backup isolation';end if;
 update public.baby_backups set snapshot='{"unauthorized":true}' where baby_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 get diagnostics n=row_count;if n<>0 then raise exception 'FAIL: cross-account write';end if;
 begin
  insert into public.baby_backups(baby_id,user_id,snapshot) values('cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111','{}');
  raise exception 'FAIL: cross-account insert';
 exception when insufficient_privilege then null;end;
 select count(*) into n from public.save_baby_snapshot('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',1,'{"test":true}');
 if n<>1 then raise exception 'FAIL: owner compare-and-swap';end if;
 select count(*) into n from public.save_baby_snapshot('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',1,'{"stale":true}');
 if n<>0 then raise exception 'FAIL: stale revision overwrote cloud data';end if;
 select count(*) into n from public.save_baby_snapshot('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',1,'{"intruder":true}');
 if n<>0 then raise exception 'FAIL: cross-account RPC write';end if;
end $$;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
select set_config('request.jwt.claims','{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}',true);
do $$ begin
 if (select count(*) from public.babies)<>1 then raise exception 'FAIL: caregiver baby read';end if;
 if (select count(*) from public.baby_backups)<>0 then raise exception 'FAIL: caregiver gained owner backup access';end if;
end $$;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ begin
 begin
  perform * from public.baby_backups;
  raise exception 'FAIL: anonymous backup access';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select 'PASS: owner isolation, caregiver restriction, anonymous restriction and stale-revision protection. Test fixtures rolled back.' as result;
