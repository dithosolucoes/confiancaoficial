
-- Atualiza a regra de cálculo do Pagamento ao Técnico para Peças (Orçamento) e Adicional.
-- Lucro da Peça = Valor de Venda - Custo c/ IVA (23%)
-- Participação do Técnico = 50% do Lucro (mínimo 0)
-- Aplica-se a quote_parts_items e service_materials, em qualquer referência (WO/SR/CO).

CREATE OR REPLACE FUNCTION public.resolve_service_payout_amount(_service_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  sr record;
  fixed_amount numeric := 0;
  labor_amount numeric := 0;
  extra_amount numeric := 0;
  parts_profit numeric := 0;
  materials_profit numeric := 0;
  vat_factor numeric := 1.23;
BEGIN
  SELECT id, reference, appliance_type, is_warranty, labor_cost, labor_rejected_at,
         labor_approved_at, labor_paid_at, extra_fee, fixed_payout_amount
    INTO sr
  FROM public.service_requests
  WHERE id = _service_id;

  IF sr.id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Deslocação fixa
  fixed_amount := coalesce(
    sr.fixed_payout_amount,
    public.resolve_payout_amount(sr.reference, sr.appliance_type),
    0
  );

  -- Mão de Obra (70% técnico) — ignora se rejeitada
  labor_amount := CASE
    WHEN sr.labor_rejected_at IS NOT NULL AND sr.labor_approved_at IS NULL AND sr.labor_paid_at IS NULL THEN 0
    ELSE coalesce(sr.labor_cost, 0)
  END;

  -- Taxa Extra (70% técnico) — zerada em garantia
  extra_amount := CASE
    WHEN coalesce(sr.is_warranty, false) THEN 0
    ELSE coalesce(sr.extra_fee, 0)
  END;

  -- Lucro das Peças do Orçamento: sum(max(0, sale - cost*1.23))
  SELECT coalesce(sum(GREATEST(0, coalesce(q.sale_value,0) - coalesce(q.cost_without_vat,0) * vat_factor)), 0)
    INTO parts_profit
  FROM public.quote_parts_items q
  WHERE q.service_request_id = _service_id;

  -- Lucro do Adicional (service_materials): sale = material_cost*qty, cost = supplier_cost*qty*1.23
  SELECT coalesce(sum(
    GREATEST(0,
      coalesce(m.material_cost,0) * coalesce(m.quantity,1)
      - coalesce(m.supplier_cost,0) * coalesce(m.quantity,1) * vat_factor
    )
  ), 0)
    INTO materials_profit
  FROM public.service_materials m
  WHERE m.service_request_id = _service_id
    AND coalesce(m.status, '') <> 'rejected';

  RETURN round((
    fixed_amount
    + (labor_amount * 0.7)
    + (extra_amount * 0.7)
    + (parts_profit * 0.5)
    + (materials_profit * 0.5)
  )::numeric, 2);
END;
$function$;

-- Recalcula todos os serviços não-overridden (incluindo locked) com a nova regra.
UPDATE public.service_requests sr
SET technician_payout = public.resolve_service_payout_amount(sr.id)
WHERE coalesce(sr.technician_payout_overridden, false) = false
  AND public.resolve_service_payout_amount(sr.id) IS NOT NULL;
