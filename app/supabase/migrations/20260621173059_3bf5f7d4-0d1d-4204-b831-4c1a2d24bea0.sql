CREATE OR REPLACE FUNCTION public.resolve_service_payout_amount(_service_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  sr record;
  ref_prefix text;
  fixed_amount numeric := 0;
  labor_amount numeric := 0;
  extra_amount numeric := 0;
  materials_amount numeric := 0;
  mat_pct numeric := 0.5;
BEGIN
  SELECT id, reference, appliance_type, is_warranty, labor_cost, labor_rejected_at, labor_approved_at, labor_paid_at, extra_fee
    INTO sr
  FROM public.service_requests
  WHERE id = _service_id;

  IF sr.id IS NULL THEN
    RETURN NULL;
  END IF;

  ref_prefix := upper(left(coalesce(sr.reference, ''), 2));
  mat_pct := CASE WHEN ref_prefix = 'CO' THEN 0.7 ELSE 0.5 END;

  -- Deslocação fixa sempre é paga ao técnico (independente de garantia)
  fixed_amount := coalesce(public.resolve_payout_amount(sr.reference, sr.appliance_type), 0);

  labor_amount := CASE
    WHEN sr.labor_rejected_at IS NOT NULL AND sr.labor_approved_at IS NULL AND sr.labor_paid_at IS NULL THEN 0
    ELSE coalesce(sr.labor_cost, 0)
  END;

  extra_amount := CASE
    WHEN coalesce(sr.is_warranty, false) THEN 0
    ELSE coalesce(sr.extra_fee, 0)
  END;

  SELECT coalesce(sum(q.sale_value), 0)
    INTO materials_amount
  FROM public.quote_parts_items q
  WHERE q.service_request_id = _service_id;

  IF ref_prefix = 'CO' THEN
    SELECT materials_amount + coalesce(sum(m.material_cost), 0)
      INTO materials_amount
    FROM public.service_materials m
    WHERE m.service_request_id = _service_id
      AND coalesce(m.status, '') <> 'rejected';
  END IF;

  RETURN round((fixed_amount + (labor_amount * 0.7) + (extra_amount * 0.7) + (materials_amount * mat_pct))::numeric, 2);
END;
$function$;

-- Recompute payouts for completed services (including warranties) to reflect the fixed deslocação
UPDATE public.service_requests sr
SET technician_payout = public.resolve_service_payout_amount(sr.id)
WHERE sr.status = 'completed'
  AND coalesce(sr.technician_payout_overridden, false) = false;