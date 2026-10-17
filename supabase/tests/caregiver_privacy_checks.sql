-- Run this COMPLETE query after migration 004. All fixtures are rolled back.
DO $privacy$
DECLARE
  owner_id uuid := gen_random_uuid();
  caregiver_id uuid := gen_random_uuid();
  outsider_id uuid := gen_random_uuid();
  test_baby uuid := gen_random_uuid();
  other_baby uuid := gen_random_uuid();
  valid_hash text := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  expired_hash text := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  revoke_hash text := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  recipient text;
  invite_id uuid;
  denied boolean;
  changed integer;
  entry jsonb;
BEGIN
  recipient := 'privacy-' || caregiver_id::text || '@example.test';
  BEGIN
    INSERT INTO auth.users(id,email,email_confirmed_at) VALUES (owner_id,'owner-'||owner_id::text||'@example.test',now()),(caregiver_id,recipient,now()),(outsider_id,'outsider-'||outsider_id::text||'@example.test',now());
    INSERT INTO public.profiles(id,display_name) VALUES (owner_id,'Parent A'),(caregiver_id,'Parent B');
    INSERT INTO public.babies(id,owner_id,name,date_of_birth) VALUES (test_baby,owner_id,'Privacy test A','2026-01-01'),(other_baby,caregiver_id,'Privacy test B','2026-01-01');
    INSERT INTO public.baby_backups(baby_id,user_id,snapshot) VALUES (test_baby,owner_id,'{"events":[]}'),(other_baby,caregiver_id,'{"events":[]}');
    INSERT INTO public.caregiver_invites(baby_id,invited_email,token_hash,created_by,expires_at) VALUES (test_baby,recipient,expired_hash,owner_id,now()-interval '1 day');
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
    PERFORM set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
    PERFORM * FROM public.create_caregiver_invite(test_baby,recipient,valid_hash);
    PERFORM set_config('request.jwt.claim.sub',outsider_id::text,true);
    PERFORM set_config('request.jwt.claims',json_build_object('sub',outsider_id,'role','authenticated')::text,true);
    denied := false;
    BEGIN
      PERFORM public.accept_caregiver_invite(valid_hash);
    EXCEPTION WHEN raise_exception THEN denied := true;
    END;
    IF NOT denied THEN RAISE EXCEPTION 'FAIL: wrong email accepted'; END IF;
    IF EXISTS(SELECT 1 FROM public.baby_backups) THEN RAISE EXCEPTION 'FAIL: unrelated account can read backups'; END IF;
    PERFORM set_config('request.jwt.claim.sub',caregiver_id::text,true);
    PERFORM set_config('request.jwt.claims',json_build_object('sub',caregiver_id,'role','authenticated')::text,true);
    IF EXISTS(SELECT 1 FROM public.baby_backups b WHERE b.baby_id=test_baby) THEN RAISE EXCEPTION 'FAIL: pending invitation grants access'; END IF;
    denied := false;
    BEGIN
      PERFORM public.accept_caregiver_invite(expired_hash);
    EXCEPTION WHEN raise_exception THEN denied := true;
    END;
    IF NOT denied THEN RAISE EXCEPTION 'FAIL: expired invitation accepted'; END IF;
    PERFORM public.accept_caregiver_invite(valid_hash);
    IF NOT EXISTS(SELECT 1 FROM public.baby_backups b WHERE b.baby_id=test_baby) THEN RAISE EXCEPTION 'FAIL: caregiver cannot read shared baby'; END IF;
    denied := false;
    BEGIN
      PERFORM public.accept_caregiver_invite(valid_hash);
    EXCEPTION WHEN raise_exception THEN denied := true;
    END;
    IF NOT denied THEN RAISE EXCEPTION 'FAIL: invitation replay'; END IF;
    denied := false;
    BEGIN
      PERFORM * FROM public.create_caregiver_invite(test_baby,'outsider-'||outsider_id::text||'@example.test',revoke_hash);
    EXCEPTION WHEN raise_exception THEN denied := true;
    END;
    IF NOT denied THEN RAISE EXCEPTION 'FAIL: caregiver can invite others'; END IF;
    IF EXISTS(SELECT 1 FROM public.caregiver_invites i WHERE i.baby_id=test_baby) THEN RAISE EXCEPTION 'FAIL: caregiver sees owner invitation metadata'; END IF;
    SELECT count(*) INTO changed FROM public.save_baby_snapshot(test_baby,1,'{"events":[{"id":"test-entry","notes":"test","createdBy":"spoofed"}]}');
    IF changed<>1 THEN RAISE EXCEPTION 'FAIL: caregiver write blocked'; END IF;
    SELECT b.snapshot->'events'->0 INTO entry FROM public.baby_backups b WHERE b.baby_id=test_baby;
    IF entry->>'createdBy'<>caregiver_id::text OR entry->>'updatedByName'<>'Parent B' THEN RAISE EXCEPTION 'FAIL: attribution spoofing'; END IF;
    SELECT count(*) INTO changed FROM public.save_baby_snapshot(test_baby,1,'{"events":[]}');
    IF changed<>0 THEN RAISE EXCEPTION 'FAIL: stale revision overwrote data'; END IF;
    PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
    PERFORM set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
    PERFORM public.remove_baby_caregiver(test_baby,caregiver_id);
    SELECT i.invite_id INTO invite_id FROM public.create_caregiver_invite(test_baby,recipient,revoke_hash) i;
    PERFORM public.revoke_caregiver_invite(invite_id);
    PERFORM set_config('request.jwt.claim.sub',caregiver_id::text,true);
    PERFORM set_config('request.jwt.claims',json_build_object('sub',caregiver_id,'role','authenticated')::text,true);
    IF EXISTS(SELECT 1 FROM public.baby_backups b WHERE b.baby_id=test_baby) THEN RAISE EXCEPTION 'FAIL: removed caregiver still reads'; END IF;
    SELECT count(*) INTO changed FROM public.save_baby_snapshot(test_baby,2,'{"events":[]}');
    IF changed<>0 THEN RAISE EXCEPTION 'FAIL: removed caregiver still writes'; END IF;
    denied := false;
    BEGIN
      PERFORM public.accept_caregiver_invite(revoke_hash);
    EXCEPTION WHEN raise_exception THEN denied := true;
    END;
    IF NOT denied THEN RAISE EXCEPTION 'FAIL: revoked invitation accepted'; END IF;
    SET LOCAL ROLE anon;
    PERFORM set_config('request.jwt.claim.sub','',true);
    PERFORM set_config('request.jwt.claims','{"role":"anon"}',true);
    denied := false;
    BEGIN
      PERFORM public.accept_caregiver_invite(valid_hash);
    EXCEPTION WHEN insufficient_privilege THEN denied := true;
    END;
    IF NOT denied THEN RAISE EXCEPTION 'FAIL: anonymous redemption'; END IF;
    RAISE EXCEPTION USING ERRCODE='P9999', MESSAGE='Rollback successful test fixtures';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN
    NULL;
  END;
END;
$privacy$;
SELECT 'PASS: caregiver access, invitations, attribution and revision checks. Test fixtures rolled back.' AS result;
