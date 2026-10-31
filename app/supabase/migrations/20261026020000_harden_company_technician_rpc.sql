-- Endurece create_company_technician:
-- 1) exige sessão autenticada (sem sessão, nada é criado);
-- 2) checa o papel do chamador dentro da própria função:
--    apenas gestor (Master) ou company_admin da mesma empresa;
-- 3) remove o acesso de anon e de PUBLIC.

CREATE OR REPLACE FUNCTION public.create_company_technician(
  p_company_id UUID,
  p_full_name TEXT,
  p_phone TEXT,
  p_email TEXT,
  p_address TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_uid UUID;
  v_caller_role TEXT;
  v_caller_company UUID;
  v_new_profile_id UUID;
BEGIN
  v_caller_uid := auth.uid();

  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: é necessário estar autenticado.' USING ERRCODE = '42501';
  END IF;

  SELECT user_type, company_id INTO v_caller_role, v_caller_company
  FROM public.profiles
  WHERE user_id = v_caller_uid
  LIMIT 1;

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: perfil não encontrado.' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    v_caller_role = 'gestor'
    OR (v_caller_role = 'company_admin' AND v_caller_company = p_company_id)
  ) THEN
    RAISE EXCEPTION 'Acesso negado: apenas o Gestor Master ou o Administrador desta empresa podem cadastrar técnicos.' USING ERRCODE = '42501';
  END IF;

  IF p_full_name IS NULL OR btrim(p_full_name) = '' THEN
    RAISE EXCEPTION 'Nome do técnico é obrigatório.' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = p_company_id) THEN
    RAISE EXCEPTION 'Empresa não encontrada.' USING ERRCODE = '22023';
  END IF;

  v_new_profile_id := gen_random_uuid();

  INSERT INTO public.profiles (
    id, user_id, full_name, phone, email, address,
    user_type, company_id, is_approved, is_partner, created_at, updated_at
  ) VALUES (
    v_new_profile_id, v_new_profile_id, p_full_name, p_phone, p_email, p_address,
    'technician', p_company_id, true, true, now(), now()
  );

  RETURN jsonb_build_object(
    'id', v_new_profile_id,
    'user_id', v_new_profile_id,
    'full_name', p_full_name,
    'phone', p_phone,
    'email', p_email,
    'address', p_address,
    'user_type', 'technician',
    'company_id', p_company_id,
    'is_approved', true,
    'is_partner', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_company_technician(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_company_technician(UUID, TEXT, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_company_technician(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;
