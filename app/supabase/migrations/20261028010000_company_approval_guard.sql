-- Empresa parceira: cadastro nasce não aprovado, e só o gestor aprova.
--
-- Achado desta rodada: a política de RLS "Company admins can view and update
-- their own company" é FOR ALL sem WITH CHECK, então o dono da empresa podia
-- gravar is_approved = true na própria linha e se autoaprovar. Este trigger
-- fecha essa brecha sem mexer na política (que continua necessária para o
-- dono editar nome, NIF, telefone, IBAN etc. da própria empresa).

-- 1) Novo cadastro nasce pendente. Linhas existentes não são alteradas.
ALTER TABLE public.companies ALTER COLUMN is_approved SET DEFAULT false;

-- 2) Só o Gestor Master pode mudar is_approved, em qualquer UPDATE na tabela,
--    venha de onde vier (RPC, PostgREST direto, etc.).
CREATE OR REPLACE FUNCTION public.guard_company_approval_field()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_approved IS DISTINCT FROM OLD.is_approved
     AND NOT public.is_gestor(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas o Gestor Master pode aprovar ou suspender uma empresa.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_company_approval_field() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_company_approval ON public.companies;
CREATE TRIGGER guard_company_approval
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_company_approval_field();
