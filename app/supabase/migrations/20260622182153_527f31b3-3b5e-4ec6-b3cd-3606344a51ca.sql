
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
  parts_sale numeric := 0;
  parts_cost numeric := 0;
  materials_sale numeric := 0;
  materials_cost numeric := 0;
  total_profit numeric := 0;
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

  fixed_amount := coalesce(
    sr.fixed_payout_amount,
    public.resolve_payout_amount(sr.reference, sr.appliance_type),
    0
  );

  labor_amount := CASE
    WHEN sr.labor_rejected_at IS NOT NULL AND sr.labor_approved_at IS NULL AND sr.labor_paid_at IS NULL THEN 0
    ELSE coalesce(sr.labor_cost, 0)
  END;

  extra_amount := CASE
    WHEN coalesce(sr.is_warranty, false) THEN 0
    ELSE coalesce(sr.extra_fee, 0)
  END;

  SELECT coalesce(sum(coalesce(q.sale_value,0)), 0),
         coalesce(sum(coalesce(q.cost_without_vat,0)), 0)
    INTO parts_sale, parts_cost
  FROM public.quote_parts_items q
  WHERE q.service_request_id = _service_id;

  SELECT coalesce(sum(coalesce(m.material_cost,0) * coalesce(m.quantity,1)), 0),
         coalesce(sum(coalesce(m.supplier_cost,0) * coalesce(m.quantity,1)), 0)
    INTO materials_sale, materials_cost
  FROM public.service_materials m
  WHERE m.service_request_id = _service_id
    AND coalesce(m.status, '') <> 'rejected';

  total_profit := GREATEST(
    0,
    (parts_sale + materials_sale) - ((parts_cost + materials_cost) * vat_factor)
  );

  RETURN round((
    fixed_amount
    + (labor_amount * 0.7)
    + (extra_amount * 0.7)
    + (total_profit * 0.5)
  )::numeric, 2);
END;
$function$;

SELECT public.recalculate_all_technician_payouts();
