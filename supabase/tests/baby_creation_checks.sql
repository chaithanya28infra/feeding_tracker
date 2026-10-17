-- Complete query. Synthetic records are rolled back, including on failure.
DO $creation$
DECLARE
  parent_id uuid := gen_random_uuid();
  other_id uuid := gen_random_uuid();
  test_baby uuid := gen_random_uuid();
  returned_id uuid;
  denied boolean;
BEGIN
  BEGIN
    INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
      (parent_id,'creation-'||parent_id::text||'@example.test',now()),
      (other_id,'creation-'||other_id::text||'@example.test',now());
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub',parent_id::text,true);
    PERFORM set_config('request.jwt.claims',json_build_object('sub',parent_id,'role','authenticated')::text,true);
    INSERT INTO public.babies(id,owner_id,name,date_of_birth) VALUES (test_baby,parent_id,'Creation check','2026-01-01') RETURNING id INTO returned_id;
    IF returned_id IS DISTINCT FROM test_baby THEN RAISE EXCEPTION 'FAIL: insert cannot return new baby'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.babies WHERE id=test_baby) THEN RAISE EXCEPTION 'FAIL: owner cannot read new baby'; END IF;
    INSERT INTO public.baby_backups(baby_id,user_id,snapshot) VALUES(test_baby,parent_id,'{"events":[]}');
    denied := false;
    BEGIN
      INSERT INTO public.babies(owner_id,name,date_of_birth) VALUES(other_id,'Wrong owner','2026-01-01');
    EXCEPTION WHEN insufficient_privilege THEN denied := true;
    END;
    IF NOT denied THEN RAISE EXCEPTION 'FAIL: parent can create a baby for another account'; END IF;
    PERFORM set_config('request.jwt.claim.sub',other_id::text,true);
    IF EXISTS(SELECT 1 FROM public.babies WHERE id=test_baby) THEN RAISE EXCEPTION 'FAIL: outsider can read baby'; END IF;
    IF EXISTS(SELECT 1 FROM public.baby_backups b WHERE b.baby_id=test_baby) THEN RAISE EXCEPTION 'FAIL: outsider can read backup'; END IF;
    SET LOCAL ROLE anon;
    PERFORM set_config('request.jwt.claim.sub','',true);
    denied := false;
    BEGIN
      INSERT INTO public.babies(owner_id,name,date_of_birth) VALUES(parent_id,'Anonymous','2026-01-01');
    EXCEPTION WHEN insufficient_privilege THEN denied := true;
    END;
    IF NOT denied THEN RAISE EXCEPTION 'FAIL: anonymous baby creation allowed'; END IF;
    RAISE EXCEPTION USING ERRCODE='P9998', MESSAGE='rollback creation fixtures';
  EXCEPTION WHEN SQLSTATE 'P9998' THEN NULL;
  END;
END;
$creation$;
SELECT 'PASS: owner can create baby and backup; cross-account and anonymous creation denied; fixtures rolled back.' AS result;
