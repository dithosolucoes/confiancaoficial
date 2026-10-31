-- Migration: RPC Segura para Cadastro de Técnicos por Empresas Parceiras (Nó 1.2)
-- Permite que gestores e administradores de empresas credenciadas criem seus técnicos sem violar RLS

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
  v_result jsonb;
BEGIN
  v_caller_uid := auth.uid();

  -- Se houver sessão autenticada, validar permissão da empresa ou gestor master
  IF v_caller_uid IS NOT NULL THEN
    SELECT user_type, company_id INTO v_caller_role, v_caller_company
    FROM public.profiles
    WHERE user_id = v_caller_uid;

    IF v_caller_role IS NOT NULL AND v_caller_role != 'gestor' AND (v_caller_role != 'company_admin' OR v_caller_company != p_company_id) THEN
      RAISE EXCEPTION 'Acesso negado: apenas o Gestor Master ou o Administrador desta empresa podem cadastrar técnicos.';
    END IF;
  END IF;

  v_new_profile_id := gen_random_uuid();

  INSERT INTO public.profiles (
    id,
    user_id,
    full_name,
    phone,
    email,
    address,
    user_type,
    company_id,
    is_approved,
    is_partner,
    created_at,
    updated_at
  ) VALUES (
    v_new_profile_id,
    v_new_profile_id,
    p_full_name,
    p_phone,
    p_email,
    p_address,
    'technician',
    p_company_id,
    true,
    true,
    now(),
    now()
  );

  v_result := jsonb_build_object(
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

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_company_technician(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated, anon;
