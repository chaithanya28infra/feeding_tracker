-- Repair authenticated baby creation without disabling RLS or granting anon writes.
-- Safe to run again; no baby records are changed.
BEGIN;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT ON public.babies TO authenticated;
ALTER TABLE public.babies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS baby_create ON public.babies;
CREATE POLICY baby_create ON public.babies FOR INSERT TO authenticated
  WITH CHECK (owner_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS baby_read ON public.babies;
CREATE POLICY baby_read ON public.babies FOR SELECT TO authenticated
  -- INSERT ... RETURNING must authorize the new owner directly. The stable
  -- helper's table lookup cannot see a row inserted by the same statement.
  USING (owner_id = (SELECT auth.uid()) OR public.can_access_baby(id));
COMMIT;
