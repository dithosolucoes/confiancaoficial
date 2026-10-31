-- Data de entrada em vigor das novas regras de remuneração dos técnicos: 01/08/2026
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
BEGIN
  SELECT id, reference, appliance_type, is_warranty, labor_cost, labor_rejected_at,
         labor_approved_at, labor_paid_at, extra_fee, deslocacao_fee, fixed_payout_amount,
         quote_additional_value, quote_additional_cost, quote_status, created_at
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
  IF is_new_rule THEN
    service_fee := COALESCE(
      NULLIF(sr.deslocacao_fee, 0),
      CASE
        WHEN sr.appliance_type IN ('Esquentador reparação', 'Vistoria técnica / Seguradora') THEN 85
        WHEN sr.appliance_type = 'Esquentador instalação' THEN 75
        ELSE 55
      END
    );

    -- Orçamento recusado: apenas 50% da Taxa de Serviço
    IF sr.quote_status = 'rejected' THEN
      RETURN round((service_fee * 0.5)::numeric, 2);
    END IF;

    RETURN round((
      (service_fee * 0.5)
      + (labor_amount * 0.5)
      + (extra_amount * 0.5)
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
$function$;

-- Repor os serviços anteriores a 01/08/2026 nos valores da regra antiga
-- (apenas os que não estão bloqueados nem alterados manualmente pelo gestor)
DO $$
DECLARE
  r record;
  computed numeric;
  cnt integer := 0;
BEGIN
  FOR r IN
    SELECT id, technician_payout
      FROM public.service_requests
     WHERE created_at < '2026-08-01 00:00:00+01'::timestamptz
       AND COALESCE(technician_payout_locked, false) = false
       AND COALESCE(technician_payout_overridden, false) = false
  LOOP
    computed := public.resolve_service_payout_amount(r.id);
    IF computed IS NOT NULL AND computed IS DISTINCT FROM r.technician_payout THEN
      UPDATE public.service_requests
         SET technician_payout = computed
       WHERE id = r.id;
      cnt := cnt + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'Serviços repostos na regra antiga: %', cnt;
END $$;