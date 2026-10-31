-- 1) Snapshot column on service_requests
ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS fixed_payout_amount numeric;

-- 2) Trigger to populate snapshot on insert
CREATE OR REPLACE FUNCTION public.set_fixed_payout_amount_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.fixed_payout_amount IS NULL THEN
    NEW.fixed_payout_amount := coalesce(
      public.resolve_payout_amount(NEW.reference, NEW.appliance_type),
      0
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_fixed_payout_amount ON public.service_requests;
CREATE TRIGGER trg_set_fixed_payout_amount
BEFORE INSERT ON public.service_requests
FOR EACH ROW EXECUTE FUNCTION public.set_fixed_payout_amount_on_insert();

-- 3) Backfill existing rows with the current rate
UPDATE public.service_requests sr
SET fixed_payout_amount = coalesce(
  public.resolve_payout_amount(sr.reference, sr.appliance_type),
  0
)
WHERE sr.fixed_payout_amount IS NULL;

-- 4) Update payout calculation to prefer the snapshot
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
  SELECT id, reference, appliance_type, is_warranty, labor_cost, labor_rejected_at, labor_approved_at, labor_paid_at, extra_fee, fixed_payout_amount
    INTO sr
  FROM public.service_requests
  WHERE id = _service_id;

  IF sr.id IS NULL THEN
    RETURN NULL;
  END IF;

  ref_prefix := upper(left(coalesce(sr.reference, ''), 2));
  mat_pct := CASE WHEN ref_prefix = 'CO' THEN 0.7 ELSE 0.5 END;

  -- Deslocação fixa: usa o snapshot do serviço; fallback para a taxa actual
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