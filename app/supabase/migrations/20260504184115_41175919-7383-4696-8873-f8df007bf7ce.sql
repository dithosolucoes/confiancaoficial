-- 1) Restrict self-registration: never accept 'technician' from signup metadata.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  requested_type text;
  resolved_type text;
BEGIN
  requested_type := COALESCE(NEW.raw_user_meta_data->>'user_type', 'customer');

  resolved_type := CASE
    -- Only whitelisted emails may become 'gestor'
    WHEN requested_type = 'gestor'
         AND NEW.email IN ('confiancaversatilidade@gmail.com', 'ifoundlx.adm@gmail.com')
      THEN 'gestor'
    -- Self-registration as 'technician' is NOT allowed; gestor must promote manually
    WHEN requested_type = 'technician' THEN 'customer'
    WHEN requested_type = 'gestor' THEN 'customer'
    ELSE 'customer'
  END;

  INSERT INTO public.profiles (user_id, full_name, user_type, email, is_approved)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    resolved_type,
    COALESCE(NEW.email, ''),
    true
  );
  RETURN NEW;
END;
$function$;

-- 2) Revoke direct EXECUTE on SECURITY DEFINER helpers from anon/authenticated.
--    They remain callable from RLS policy expressions (which run as policy owner).
REVOKE EXECUTE ON FUNCTION public.is_gestor(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.is_approved_technician(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.is_partner_member(uuid, uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.get_partner_user_ids(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.get_user_org_ids(uuid) FROM anon, authenticated, public;