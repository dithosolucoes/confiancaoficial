-- Repasse à empresa parceira vira conta a pagar (decisão D10 do Thomas, 31/10/2026).
-- Mesmo caminho do técnico: uma conta a pagar por empresa, paga pela tela de Contas a pagar.
-- company_payouts registra qual serviço já foi lançado, para não cobrar duas vezes.

CREATE TABLE IF NOT EXISTS public.company_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  service_request_id uuid NOT NULL UNIQUE REFERENCES public.service_requests(id) ON DELETE RESTRICT,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  payable_id uuid REFERENCES public.accounts_payable(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_company_payouts_company ON public.company_payouts(company_id);

ALTER TABLE public.company_payouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Gestor gerencia repasses de empresa" ON public.company_payouts;
CREATE POLICY "Gestor gerencia repasses de empresa" ON public.company_payouts
  FOR ALL TO authenticated
  USING (public.is_gestor(auth.uid()))
  WITH CHECK (public.is_gestor(auth.uid()));
REVOKE ALL ON public.company_payouts FROM anon;

-- Gera uma conta a pagar por empresa a partir da lista de serviços.
-- Tudo ou nada: se um serviço já foi lançado (service_request_id é único), nada é gravado.
CREATE OR REPLACE FUNCTION public.gerar_repasses_empresas(p_due_date date, p_items jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g record;
  v_payable uuid;
  v_count integer := 0;
BEGIN
  IF NOT public.is_gestor(auth.uid()) THEN
    RAISE EXCEPTION 'Só o gestor pode gerar repasses às empresas';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Nenhum serviço para repassar';
  END IF;

  -- Cada serviço precisa estar concluído e pertencer à empresa informada.
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_items) i
    LEFT JOIN public.service_requests sr ON sr.id = (i->>'service_request_id')::uuid
    WHERE sr.id IS NULL
       OR sr.status <> 'completed'
       OR sr.assigned_company_id IS DISTINCT FROM (i->>'company_id')::uuid
       OR (i->>'amount')::numeric < 0
  ) THEN
    RAISE EXCEPTION 'Algum serviço não está concluído ou não pertence à empresa informada';
  END IF;

  FOR g IN
    SELECT (i->>'company_id')::uuid AS company_id,
           max(i->>'company_name') AS company_name,
           sum((i->>'amount')::numeric) AS total,
           count(*) AS qtd
    FROM jsonb_array_elements(p_items) i
    GROUP BY 1
  LOOP
    INSERT INTO public.accounts_payable (description, category, supplier_name, total_amount, due_date, status, notes, created_by)
    VALUES (
      'Repasse empresa parceira — ' || g.company_name,
      'outros',
      g.company_name,
      g.total,
      p_due_date,
      'pendente',
      g.qtd || ' serviço(s) concluído(s) de empresa parceira',
      auth.uid()
    )
    RETURNING id INTO v_payable;

    INSERT INTO public.company_payouts (company_id, service_request_id, amount, payable_id, created_by)
    SELECT g.company_id, (i->>'service_request_id')::uuid, (i->>'amount')::numeric, v_payable, auth.uid()
    FROM jsonb_array_elements(p_items) i
    WHERE (i->>'company_id')::uuid = g.company_id;

    v_count := v_count + g.qtd;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.gerar_repasses_empresas(date, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gerar_repasses_empresas(date, jsonb) TO authenticated;
