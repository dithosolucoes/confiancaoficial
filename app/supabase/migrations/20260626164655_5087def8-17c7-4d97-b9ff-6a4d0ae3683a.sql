-- Ensure every SECURITY DEFINER function in public has search_path set
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) c
        WHERE c LIKE 'search_path=%'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', r.sig);
  END LOOP;
END$$;

-- Also pin compute_payout_period (not SECURITY DEFINER, but flagged as mutable search_path)
DO $$
BEGIN
  EXECUTE 'ALTER FUNCTION public.compute_payout_period(date, text) SET search_path = public';
EXCEPTION WHEN others THEN
  NULL;
END$$;

-- Revoke EXECUTE on SECURITY DEFINER functions from anon/authenticated,
-- except a small whitelist of intentionally-callable RPCs.
DO $$
DECLARE
  r record;
  whitelist text[] := ARRAY[
    'is_gestor',
    'is_admin',
    'has_role',
    'get_user_role',
    'get_current_user_role',
    'is_approved_technician',
    'is_partner_member',
    'get_user_org_ids',
    'get_partner_user_ids'
  ];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
  LOOP
    IF NOT (r.proname = ANY (whitelist)) THEN
      BEGIN
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
      EXCEPTION WHEN others THEN
        NULL;
      END;
    END IF;
  END LOOP;
END$$;