
-- 1. Function to recompute a specific service_requests row, honoring lock/override
CREATE OR REPLACE FUNCTION public.recompute_service_payout(_service_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sr record;
  computed numeric;
BEGIN
  IF _service_id IS NULL THEN RETURN; END IF;

  SELECT id, technician_payout, technician_payout_locked, technician_payout_overridden
    INTO sr
    FROM public.service_requests
   WHERE id = _service_id;

  IF sr.id IS NULL THEN RETURN; END IF;
  IF COALESCE(sr.technician_payout_locked, false) THEN RETURN; END IF;
  IF COALESCE(sr.technician_payout_overridden, false) THEN RETURN; END IF;

  computed := public.resolve_service_payout_amount(_service_id);
  IF computed IS NOT NULL AND computed IS DISTINCT FROM sr.technician_payout THEN
    UPDATE public.service_requests
       SET technician_payout = computed
     WHERE id = _service_id;
  END IF;
END;
$$;

-- 2. BEFORE UPDATE trigger on service_requests: refresh when formula fields change
CREATE OR REPLACE FUNCTION public.refresh_payout_on_formula_fields_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  computed numeric;
BEGIN
  IF COALESCE(NEW.technician_payout_locked, false) THEN RETURN NEW; END IF;
  IF COALESCE(NEW.technician_payout_overridden, false) THEN RETURN NEW; END IF;

  IF NEW.labor_cost IS DISTINCT FROM OLD.labor_cost
     OR NEW.extra_fee IS DISTINCT FROM OLD.extra_fee
     OR NEW.is_warranty IS DISTINCT FROM OLD.is_warranty
     OR NEW.quote_additional_value IS DISTINCT FROM OLD.quote_additional_value
     OR NEW.quote_additional_cost IS DISTINCT FROM OLD.quote_additional_cost
     OR NEW.labor_rejected_at IS DISTINCT FROM OLD.labor_rejected_at
     OR NEW.labor_approved_at IS DISTINCT FROM OLD.labor_approved_at
     OR NEW.labor_paid_at IS DISTINCT FROM OLD.labor_paid_at
     OR NEW.reference IS DISTINCT FROM OLD.reference
     OR NEW.appliance_type IS DISTINCT FROM OLD.appliance_type THEN
    computed := public.resolve_service_payout_amount(NEW.id);
    IF computed IS NOT NULL THEN
      NEW.technician_payout := computed;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_payout_on_formula_fields_change ON public.service_requests;
CREATE TRIGGER trg_refresh_payout_on_formula_fields_change
BEFORE UPDATE ON public.service_requests
FOR EACH ROW
EXECUTE FUNCTION public.refresh_payout_on_formula_fields_change();

-- 3. Trigger on quote_parts_items
CREATE OR REPLACE FUNCTION public.tg_refresh_payout_from_quote_parts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_service_payout(OLD.service_request_id);
    RETURN OLD;
  ELSE
    PERFORM public.recompute_service_payout(NEW.service_request_id);
    IF TG_OP = 'UPDATE' AND NEW.service_request_id IS DISTINCT FROM OLD.service_request_id THEN
      PERFORM public.recompute_service_payout(OLD.service_request_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_payout_from_quote_parts ON public.quote_parts_items;
CREATE TRIGGER trg_refresh_payout_from_quote_parts
AFTER INSERT OR UPDATE OR DELETE ON public.quote_parts_items
FOR EACH ROW
EXECUTE FUNCTION public.tg_refresh_payout_from_quote_parts();

-- 4. Trigger on service_materials
CREATE OR REPLACE FUNCTION public.tg_refresh_payout_from_materials()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_service_payout(OLD.service_request_id);
    RETURN OLD;
  ELSE
    PERFORM public.recompute_service_payout(NEW.service_request_id);
    IF TG_OP = 'UPDATE' AND NEW.service_request_id IS DISTINCT FROM OLD.service_request_id THEN
      PERFORM public.recompute_service_payout(OLD.service_request_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_payout_from_materials ON public.service_materials;
CREATE TRIGGER trg_refresh_payout_from_materials
AFTER INSERT OR UPDATE OR DELETE ON public.service_materials
FOR EACH ROW
EXECUTE FUNCTION public.tg_refresh_payout_from_materials();

-- 5. Backfill safe: only unlocked, non-overridden, not in a paid batch
WITH candidates AS (
  SELECT sr.id,
         sr.technician_payout AS old_amount,
         public.resolve_service_payout_amount(sr.id) AS new_amount
    FROM public.service_requests sr
   WHERE sr.technician_id IS NOT NULL
     AND COALESCE(sr.technician_payout_locked, false) = false
     AND COALESCE(sr.technician_payout_overridden, false) = false
     AND NOT EXISTS (
       SELECT 1 FROM public.technician_payout_batch_items i
         JOIN public.technician_payout_batches b ON b.id = i.batch_id
        WHERE i.service_request_id = sr.id AND b.status = 'paid'
     )
), to_update AS (
  SELECT id, old_amount, new_amount
    FROM candidates
   WHERE new_amount IS NOT NULL
     AND new_amount IS DISTINCT FROM old_amount
)
UPDATE public.service_requests sr
   SET technician_payout = tu.new_amount
  FROM to_update tu
 WHERE sr.id = tu.id;

-- 6. Ensure open batch item amounts and batch/payable totals are consistent
-- (defensive: sync any open-batch items whose amount != service payout)
UPDATE public.technician_payout_batch_items i
   SET amount = sr.technician_payout
  FROM public.service_requests sr,
       public.technician_payout_batches b
 WHERE i.service_request_id = sr.id
   AND b.id = i.batch_id
   AND b.status = 'open'
   AND i.amount IS DISTINCT FROM sr.technician_payout;
-- tg_sync_batch_totals recalcs batch + accounts_payable (skips paid rows)
