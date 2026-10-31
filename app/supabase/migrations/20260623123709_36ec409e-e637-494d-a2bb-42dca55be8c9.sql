
-- 1. Add quote_status separation
ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS quote_status text,
  ADD COLUMN IF NOT EXISTS quote_rejected_at timestamptz;

-- Optional CHECK to constrain values (allow null)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'service_requests_quote_status_check'
  ) THEN
    ALTER TABLE public.service_requests
      ADD CONSTRAINT service_requests_quote_status_check
      CHECK (quote_status IS NULL OR quote_status IN ('sent','accepted','rejected'));
  END IF;
END $$;

-- 2. Backfill from existing data
UPDATE public.service_requests
   SET quote_status = 'rejected',
       quote_rejected_at = COALESCE(quote_rejected_at, labor_rejected_at, now())
 WHERE quote_status IS NULL
   AND (
     status = 'quote_rejected'
     OR (labor_rejected_at IS NOT NULL AND labor_approved_at IS NULL AND labor_paid_at IS NULL)
   );

UPDATE public.service_requests
   SET quote_status = 'accepted'
 WHERE quote_status IS NULL
   AND (status IN ('quote_accepted','payment_pending','completed') OR labor_approved_at IS NOT NULL OR labor_paid_at IS NOT NULL);

UPDATE public.service_requests
   SET quote_status = 'sent'
 WHERE quote_status IS NULL
   AND status = 'quote_sent';

-- 3. Update payout function to skip rejected quotes entirely
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
         labor_approved_at, labor_paid_at, extra_fee, fixed_payout_amount,
         quote_additional_value, quote_additional_cost, quote_status
    INTO sr
  FROM public.service_requests
  WHERE id = _service_id;

  IF sr.id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Quote rejected → não há pagamento ao técnico nem qualquer valor financeiro
  IF sr.quote_status = 'rejected' THEN
    RETURN 0;
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
    INTO parts_sale, parts_cost_without_vat
  FROM public.quote_parts_items q
  WHERE q.service_request_id = _service_id;

  SELECT coalesce(sum(coalesce(m.material_cost,0) * coalesce(m.quantity,1)), 0),
         coalesce(sum(coalesce(m.supplier_cost,0) * coalesce(m.quantity,1)), 0)
    INTO materials_sale, materials_cost_without_vat
  FROM public.service_materials m
  WHERE m.service_request_id = _service_id
    AND coalesce(m.status, '') <> 'rejected';

  additional_sale := coalesce(sr.quote_additional_value, 0);
  additional_cost_without_vat := coalesce(sr.quote_additional_cost, 0);

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

-- 4. Zero out payout for already-rejected services that aren't locked/overridden
UPDATE public.service_requests
   SET technician_payout = 0
 WHERE quote_status = 'rejected'
   AND coalesce(technician_payout_locked, false) = false
   AND coalesce(technician_payout_overridden, false) = false
   AND coalesce(technician_payout, 0) <> 0;

-- 5. Recalculate everyone else
SELECT public.recalculate_all_technician_payouts();
