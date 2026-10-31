-- Regras financeiras que o gestor configura (taxa de visita e comissão da Confiança).
-- Regras são VERSÕES: só se acrescenta uma linha nova. Nunca se altera nem se apaga.
-- service_type_id NULL = regra padrão (vale para todo tipo sem regra própria).

CREATE TABLE IF NOT EXISTS public.financial_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type_id uuid REFERENCES public.service_types(id) ON DELETE RESTRICT,
  visit_charged boolean NOT NULL DEFAULT true,
  -- % da taxa de visita que vai para o técnico. O resto fica com a Confiança.
  visit_technician_pct numeric(5,2) NOT NULL DEFAULT 50
    CHECK (visit_technician_pct >= 0 AND visit_technician_pct <= 100),
  -- % da mão de obra que fica com a Confiança (comissão). O resto vai para o técnico.
  labor_confianca_pct numeric(5,2) NOT NULL DEFAULT 50
    CHECK (labor_confianca_pct >= 0 AND labor_confianca_pct <= 100),
  effective_from timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL CHECK (char_length(btrim(reason)) >= 3),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_financial_rules_lookup
  ON public.financial_rules (service_type_id, effective_from DESC, created_at DESC);

-- Regra padrão inicial: reproduz a regra em vigor desde 01/08/2026 (50% técnico / 50% Confiança).
INSERT INTO public.financial_rules (service_type_id, visit_charged, visit_technician_pct, labor_confianca_pct, effective_from, reason)
SELECT NULL, true, 50, 50, '2026-08-01T00:00:00+01:00', 'Regra inicial: 50% técnico / 50% Confiança (regra em vigor desde 01/08/2026)'
WHERE NOT EXISTS (SELECT 1 FROM public.financial_rules WHERE service_type_id IS NULL);

-- Impede alteração e exclusão (histórico imutável).
CREATE OR REPLACE FUNCTION public.financial_rules_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Regras financeiras não podem ser alteradas nem apagadas. Crie uma nova versão.';
END;
$$;

DROP TRIGGER IF EXISTS trg_financial_rules_append_only ON public.financial_rules;
CREATE TRIGGER trg_financial_rules_append_only
  BEFORE UPDATE OR DELETE ON public.financial_rules
  FOR EACH ROW EXECUTE FUNCTION public.financial_rules_append_only();

ALTER TABLE public.financial_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Gestor lê regras financeiras" ON public.financial_rules;
CREATE POLICY "Gestor lê regras financeiras" ON public.financial_rules
  FOR SELECT TO authenticated USING (public.is_gestor(auth.uid()));

DROP POLICY IF EXISTS "Gestor cria regras financeiras" ON public.financial_rules;
CREATE POLICY "Gestor cria regras financeiras" ON public.financial_rules
  FOR INSERT TO authenticated WITH CHECK (public.is_gestor(auth.uid()));

-- Regra vigente para um tipo de serviço em uma data: a da própria categoria, se houver;
-- senão a padrão. Dentro de cada grupo, vale a versão com vigência mais recente.
CREATE OR REPLACE FUNCTION public.get_effective_financial_rule(
  p_service_type_id uuid,
  p_at timestamptz DEFAULT now()
)
RETURNS public.financial_rules
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT x.* FROM (
    (SELECT r.* FROM public.financial_rules r
       WHERE r.service_type_id = p_service_type_id AND r.effective_from <= p_at
       ORDER BY r.effective_from DESC, r.created_at DESC LIMIT 1)
    UNION ALL
    (SELECT r.* FROM public.financial_rules r
       WHERE r.service_type_id IS NULL AND r.effective_from <= p_at
       ORDER BY r.effective_from DESC, r.created_at DESC LIMIT 1)
  ) x
  ORDER BY (x.service_type_id IS NULL) ASC
  LIMIT 1;
$$;

-- Snapshot no chamado: a regra vigente na abertura fica gravada no próprio chamado.
ALTER TABLE public.service_requests ADD COLUMN IF NOT EXISTS financial_rule_id uuid REFERENCES public.financial_rules(id) ON DELETE RESTRICT;
ALTER TABLE public.service_requests ADD COLUMN IF NOT EXISTS financial_rule_snapshot jsonb;

CREATE OR REPLACE FUNCTION public.set_service_financial_rule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.financial_rules;
BEGIN
  -- Sempre calculado no servidor: quem abre o chamado não escolhe a regra.
  r := public.get_effective_financial_rule(NEW.service_type_id, COALESCE(NEW.created_at, now()));
  IF r.id IS NOT NULL THEN
    NEW.financial_rule_id := r.id;
    NEW.financial_rule_snapshot := jsonb_build_object(
      'rule_id', r.id,
      'service_type_id', r.service_type_id,
      'visit_charged', r.visit_charged,
      'visit_technician_pct', r.visit_technician_pct,
      'labor_confianca_pct', r.labor_confianca_pct,
      'effective_from', r.effective_from,
      'reason', r.reason
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_service_financial_rule ON public.service_requests;
CREATE TRIGGER trg_set_service_financial_rule
  BEFORE INSERT ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_service_financial_rule();

-- Depois de criado, só o gestor mexe na regra gravada no chamado.
CREATE OR REPLACE FUNCTION public.guard_service_financial_rule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_gestor(auth.uid()) THEN
    RETURN NEW;
  END IF;
  NEW.financial_rule_id       := OLD.financial_rule_id;
  NEW.financial_rule_snapshot := OLD.financial_rule_snapshot;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_service_financial_rule ON public.service_requests;
CREATE TRIGGER trg_guard_service_financial_rule
  BEFORE UPDATE ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_service_financial_rule();
