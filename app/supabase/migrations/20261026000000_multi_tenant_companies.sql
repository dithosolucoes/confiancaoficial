-- Migration: Multi-Tenant Companies Architecture (Fase 0)
-- Suporte a Empresas Terceirizadas Parceiras e Técnicos Diretos vs de Empresa

-- 1. Criar tabela de Empresas Terceirizadas / Parceiras
CREATE TABLE IF NOT EXISTS public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  nif TEXT,
  email TEXT,
  phone TEXT,
  iban TEXT,
  address TEXT,
  commission_rate NUMERIC NOT NULL DEFAULT 0.80, -- 80% do valor do serviço repassado à empresa terceirizada
  is_approved BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_companies_nif ON public.companies(nif);
CREATE INDEX IF NOT EXISTS idx_companies_approved ON public.companies(is_approved);

-- 2. Expandir a tabela profiles com vínculo à empresa
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_company_id ON public.profiles(company_id);

-- 3. Expandir a tabela service_requests com empresa atribuída
ALTER TABLE public.service_requests 
  ADD COLUMN IF NOT EXISTS assigned_company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_service_requests_company ON public.service_requests(assigned_company_id);

-- 4. Função auxiliar para verificar a empresa do usuário logado
CREATE OR REPLACE FUNCTION public.get_user_company_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE user_id = _user_id LIMIT 1;
$$;

-- Função auxiliar para verificar se é company_admin
CREATE OR REPLACE FUNCTION public.is_company_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = _user_id AND user_type = 'company_admin'
  );
$$;

-- 5. Atualizar handle_new_user() com SEGURANÇA ESTRITA e gravação atômica de metadados
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  requested_type text;
  resolved_type text;
  req_company_id uuid;
  is_admin_creator boolean;
BEGIN
  requested_type := COALESCE(NEW.raw_user_meta_data->>'user_type', 'customer');
  
  -- Verificar se quem está criando o usuário já é um Gestor Master autenticado
  is_admin_creator := EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND user_type = 'gestor'
  );

  -- Extrair company_id se fornecido
  BEGIN
    req_company_id := (NEW.raw_user_meta_data->>'company_id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    req_company_id := NULL;
  END;

  -- SEGURANÇA: Bloqueio estrito de auto-promoção.
  -- NINGUÉM pode se registrar publicamente como 'gestor' ou 'company_admin' a menos que:
  -- 1) Seja criado por um Gestor Master autenticado (is_admin_creator); OU
  -- 2) Possua role explícita no app_metadata do Supabase Auth; OU
  -- 3) Seja o primeiro gestor no bootstrap inicial do banco (quando ainda não há gestores registrados).
  IF requested_type = 'gestor' THEN
    IF is_admin_creator
       OR (NEW.raw_app_meta_data->>'role' = 'gestor')
       OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_type = 'gestor') THEN
      resolved_type := 'gestor';
    ELSE
      -- Tentativa não autorizada de virar gestor é forçada para customer!
      resolved_type := 'customer';
    END IF;
  ELSIF requested_type = 'company_admin' THEN
    IF is_admin_creator THEN
      resolved_type := 'company_admin';
    ELSE
      resolved_type := 'customer';
    END IF;
  ELSIF requested_type = 'technician' THEN
    resolved_type := 'technician';
  ELSE
    resolved_type := 'customer';
  END IF;

  -- Inserção 100% ATÔMICA de todos os metadados (elimina necessidade de setTimeout no front)
  INSERT INTO public.profiles (
    user_id,
    full_name,
    surname,
    user_type,
    email,
    phone,
    address,
    address_complement,
    postal_code,
    localidade,
    billing_name,
    billing_nif,
    billing_address,
    iban,
    emergency_contact,
    company_id,
    is_approved
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.raw_user_meta_data->>'surname',
    resolved_type,
    COALESCE(NEW.email, ''),
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'address',
    NEW.raw_user_meta_data->>'address_complement',
    NEW.raw_user_meta_data->>'postal_code',
    NEW.raw_user_meta_data->>'localidade',
    NEW.raw_user_meta_data->>'billing_name',
    NEW.raw_user_meta_data->>'billing_nif',
    NEW.raw_user_meta_data->>'billing_address',
    NEW.raw_user_meta_data->>'iban',
    NEW.raw_user_meta_data->>'emergency_contact',
    req_company_id,
    CASE WHEN resolved_type = 'technician' THEN false ELSE true END
  )
  ON CONFLICT (user_id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    surname = COALESCE(EXCLUDED.surname, public.profiles.surname),
    email = EXCLUDED.email,
    phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
    address = COALESCE(EXCLUDED.address, public.profiles.address),
    address_complement = COALESCE(EXCLUDED.address_complement, public.profiles.address_complement),
    postal_code = COALESCE(EXCLUDED.postal_code, public.profiles.postal_code),
    localidade = COALESCE(EXCLUDED.localidade, public.profiles.localidade),
    billing_name = COALESCE(EXCLUDED.billing_name, public.profiles.billing_name),
    billing_nif = COALESCE(EXCLUDED.billing_nif, public.profiles.billing_nif),
    billing_address = COALESCE(EXCLUDED.billing_address, public.profiles.billing_address),
    iban = COALESCE(EXCLUDED.iban, public.profiles.iban),
    emergency_contact = COALESCE(EXCLUDED.emergency_contact, public.profiles.emergency_contact),
    company_id = COALESCE(EXCLUDED.company_id, public.profiles.company_id);

  RETURN NEW;
END;
$function$;

-- 6. Habilitar RLS na tabela companies
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para companies:
-- Gestor Master tem acesso total
DROP POLICY IF EXISTS "Gestores have full access to companies" ON public.companies;
CREATE POLICY "Gestores have full access to companies"
  ON public.companies
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND user_type = 'gestor')
  );

-- Dono da Empresa pode ver e editar apenas a sua própria empresa
DROP POLICY IF EXISTS "Company admins can view and update their own company" ON public.companies;
CREATE POLICY "Company admins can view and update their own company"
  ON public.companies
  FOR ALL
  TO authenticated
  USING (
    id = public.get_user_company_id(auth.uid())
  );

-- Demais autenticados podem ler dados básicos de empresas aprovadas
DROP POLICY IF EXISTS "Authenticated users can view approved companies" ON public.companies;
CREATE POLICY "Authenticated users can view approved companies"
  ON public.companies
  FOR SELECT
  TO authenticated
  USING (is_approved = true);

-- 7. RLS em service_requests para Empresa Parceira
DROP POLICY IF EXISTS "Company admins can view their assigned services" ON public.service_requests;
CREATE POLICY "Company admins can view their assigned services"
  ON public.service_requests
  FOR SELECT
  TO authenticated
  USING (
    assigned_company_id IS NOT NULL 
    AND assigned_company_id = public.get_user_company_id(auth.uid())
  );

DROP POLICY IF EXISTS "Company admins can update their assigned services" ON public.service_requests;
CREATE POLICY "Company admins can update their assigned services"
  ON public.service_requests
  FOR UPDATE
  TO authenticated
  USING (
    assigned_company_id IS NOT NULL 
    AND assigned_company_id = public.get_user_company_id(auth.uid())
  );

-- 8. RLS em profiles para Company Admin gerenciar seus técnicos
DROP POLICY IF EXISTS "Company admins can view technicians in their company" ON public.profiles;
CREATE POLICY "Company admins can view technicians in their company"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    company_id IS NOT NULL 
    AND company_id = public.get_user_company_id(auth.uid())
  );

DROP POLICY IF EXISTS "Company admins can update technicians in their company" ON public.profiles;
CREATE POLICY "Company admins can update technicians in their company"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    company_id IS NOT NULL 
    AND company_id = public.get_user_company_id(auth.uid())
  );

-- 9. Tabela de Idempotência de Webhooks Stripe (Anti-duplicação de baixas)
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  service_id TEXT,
  payment_type TEXT,
  session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Apenas gestores e service_role lêem webhooks" ON public.stripe_webhook_events;
CREATE POLICY "Apenas gestores e service_role lêem webhooks"
  ON public.stripe_webhook_events
  FOR ALL
  TO authenticated
  USING (public.is_gestor(auth.uid()));
