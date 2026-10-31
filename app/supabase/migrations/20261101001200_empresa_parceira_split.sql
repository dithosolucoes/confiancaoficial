-- Empresa parceira na divisão do serviço (decisão do Thomas, 31/10/2026).
-- A Confiança mantém a % dela. Em chamado com empresa parceira (service_requests.assigned_company_id),
-- a % da empresa sai da parte do técnico (técnico = resto). Sem empresa, nada muda.
-- Peças continuam 100% da Confiança (margem), fora da divisão. Padrão 0 = comportamento de antes.
-- Regras continuam sendo versões: só se acrescenta linha nova.

ALTER TABLE public.financial_rules ADD COLUMN IF NOT EXISTS visit_empresa_pct numeric(5,2) NOT NULL DEFAULT 0;
ALTER TABLE public.financial_rules ADD COLUMN IF NOT EXISTS labor_empresa_pct numeric(5,2) NOT NULL DEFAULT 0;

ALTER TABLE public.financial_rules DROP CONSTRAINT IF EXISTS financial_rules_visit_empresa_chk;
ALTER TABLE public.financial_rules ADD CONSTRAINT financial_rules_visit_empresa_chk
  CHECK (visit_empresa_pct >= 0 AND visit_empresa_pct <= visit_technician_pct);

ALTER TABLE public.financial_rules DROP CONSTRAINT IF EXISTS financial_rules_labor_empresa_chk;
ALTER TABLE public.financial_rules ADD CONSTRAINT financial_rules_labor_empresa_chk
  CHECK (labor_empresa_pct >= 0 AND labor_empresa_pct <= 100 - labor_confianca_pct);

-- Snapshot passa a guardar a % da empresa junto com as outras.
CREATE OR REPLACE FUNCTION public.set_service_financial_rule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.financial_rules;
BEGIN
  r := public.get_effective_financial_rule(NEW.service_type_id, COALESCE(NEW.created_at, now()));
  IF r.id IS NOT NULL THEN
    NEW.financial_rule_id := r.id;
    NEW.financial_rule_snapshot := jsonb_build_object(
      'rule_id', r.id,
      'service_type_id', r.service_type_id,
      'visit_charged', r.visit_charged,
      'visit_technician_pct', r.visit_technician_pct,
      'visit_empresa_pct', r.visit_empresa_pct,
      'labor_confianca_pct', r.labor_confianca_pct,
      'labor_empresa_pct', r.labor_empresa_pct,
      'effective_from', r.effective_from,
      'reason', r.reason
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_service_payout_amount(_service_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  sr record;
  cutoff timestamptz := '2026-08-01 00:00:00+01'::timestamptz; -- Europe/Lisbon
  is_new_rule boolean;
  service_fee numeric := 0;
  fixed_amount numeric := 0;
  labor_amount numeric := 0;
  extra_amount numeric := 0;
  parts_sale numeric := 0;
  parts_cost_without_vat numeric := 0;
  materials_sale numeric := 0;
  materials_cost_without_vat numeric := 0;
  additional_sale numeric := 0;
  additional_cost_without_vat numeric := 0;
  subtotal_sale numeric := 0;
  subtotal_cost_with_vat numeric := 0;
  total_profit numeric := 0;
  visit_tech_pct numeric := 0.5;
  labor_tech_pct numeric := 0.5;
  visit_is_charged boolean := true;
  visit_empresa_pct numeric := 0;
  labor_empresa_pct numeric := 0;
  partner_job boolean := false;
BEGIN
  SELECT id, reference, appliance_type, is_warranty, labor_cost, labor_rejected_at,
         labor_approved_at, labor_paid_at, extra_fee, deslocacao_fee, fixed_payout_amount,
         quote_additional_value, quote_additional_cost, quote_status, created_at, financial_rule_snapshot, assigned_company_id
    INTO sr
  FROM public.service_requests
  WHERE id = _service_id;

  IF sr.id IS NULL THEN
    RETURN NULL;
  END IF;

  is_new_rule := COALESCE(sr.created_at, now()) >= cutoff;

  labor_amount := CASE
    WHEN sr.labor_rejected_at IS NOT NULL AND sr.labor_approved_at IS NULL AND sr.labor_paid_at IS NULL THEN 0
    ELSE COALESCE(sr.labor_cost, 0)
  END;

  extra_amount := CASE
    WHEN COALESCE(sr.is_warranty, false) THEN 0
    ELSE COALESCE(sr.extra_fee, 0)
  END;

  -- ============ NOVA REGRA (serviços criados a partir de 01/08/2026) ============
  -- Percentagens vêm da regra gravada no chamado (financial_rule_snapshot).
  -- Sem snapshot (chamados criados antes da regra configurável), usa 50% / 50%,
  -- que é exactamente a regra que estava em vigor.
  visit_tech_pct := COALESCE((sr.financial_rule_snapshot->>'visit_technician_pct')::numeric, 50) / 100;
  labor_tech_pct := 1 - COALESCE((sr.financial_rule_snapshot->>'labor_confianca_pct')::numeric, 50) / 100;
  visit_is_charged := COALESCE((sr.financial_rule_snapshot->>'visit_charged')::boolean, true);
  -- Empresa parceira (chamado com assigned_company_id): a % dela sai da parte do técnico.
  -- Sem empresa, ou com regra antiga sem a chave, a % da empresa vale zero.
  visit_empresa_pct := COALESCE((sr.financial_rule_snapshot->>'visit_empresa_pct')::numeric, 0) / 100;
  labor_empresa_pct := COALESCE((sr.financial_rule_snapshot->>'labor_empresa_pct')::numeric, 0) / 100;
  partner_job := sr.assigned_company_id IS NOT NULL;
  IF partner_job THEN
    visit_tech_pct := visit_tech_pct - visit_empresa_pct;
    labor_tech_pct := labor_tech_pct - labor_empresa_pct;
  END IF;

  IF is_new_rule THEN
    service_fee := COALESCE(
      NULLIF(sr.deslocacao_fee, 0),
      CASE
        WHEN sr.appliance_type IN ('Esquentador reparação', 'Vistoria técnica / Seguradora') THEN 85
        WHEN sr.appliance_type = 'Esquentador instalação' THEN 75
        ELSE 55
      END
    );

    -- Garantia (retrabalho): não cobra deslocação. Alinha com computeServiceFinancials
    -- e com o extrato (src/lib/financial-rules.ts e src/lib/service-statement.ts).
    IF COALESCE(sr.is_warranty, false) THEN
      service_fee := 0;
    END IF;

    -- Visita não cobrada neste tipo de serviço: o técnico não recebe pela visita.
    IF NOT visit_is_charged THEN
      service_fee := 0;
    END IF;

    -- Orçamento recusado: só a parte da visita (conforme a regra gravada)
    IF sr.quote_status = 'rejected' THEN
      RETURN round((service_fee * visit_tech_pct)::numeric, 2);
    END IF;

    -- Taxa extra segue a mesma % da mão de obra.
    RETURN round((
      (service_fee * visit_tech_pct)
      + ((labor_amount + extra_amount) * labor_tech_pct)
    )::numeric, 2);
  END IF;

  -- ============ REGRA ANTIGA (serviços criados antes de 01/08/2026) ============
  fixed_amount := COALESCE(
    sr.fixed_payout_amount,
    public.resolve_payout_amount(sr.reference, sr.appliance_type),
    0
  );

  -- Orçamento recusado: paga apenas a deslocação (visita realizada)
  IF sr.quote_status = 'rejected' THEN
    RETURN round(COALESCE(fixed_amount, 0)::numeric, 2);
  END IF;

  SELECT COALESCE(sum(COALESCE(q.sale_value,0)), 0),
         COALESCE(sum(COALESCE(q.cost_without_vat,0)), 0)
    INTO parts_sale, parts_cost_without_vat
  FROM public.quote_parts_items q
  WHERE q.service_request_id = _service_id;

  SELECT COALESCE(sum(COALESCE(m.material_cost,0) * COALESCE(m.quantity,1)), 0),
         COALESCE(sum(COALESCE(m.supplier_cost,0) * COALESCE(m.quantity,1)), 0)
    INTO materials_sale, materials_cost_without_vat
  FROM public.service_materials m
  WHERE m.service_request_id = _service_id
    AND COALESCE(m.status, '') <> 'rejected';

  additional_sale := COALESCE(sr.quote_additional_value, 0);
  additional_cost_without_vat := COALESCE(sr.quote_additional_cost, 0);

  subtotal_sale := parts_sale + materials_sale + additional_sale;
  subtotal_cost_with_vat := (parts_cost_without_vat + materials_cost_without_vat + additional_cost_without_vat) * 1.23;
  total_profit := GREATEST(0, subtotal_sale - subtotal_cost_with_vat);

  RETURN round((
    fixed_amount
    + (labor_amount * 0.7)
    + (extra_amount * 0.7)
    + (total_profit * 0.5)
  )::numeric, 2);
END;
$function$
