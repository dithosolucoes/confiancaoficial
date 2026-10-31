
CREATE OR REPLACE FUNCTION public.refresh_payout_on_unlock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  computed numeric;
BEGIN
  IF COALESCE(OLD.technician_payout_locked, false) = true
     AND COALESCE(NEW.technician_payout_locked, false) = false
     AND COALESCE(NEW.technician_payout_overridden, false) = false THEN
    computed := public.resolve_service_payout_amount(NEW.id);
    IF computed IS NOT NULL THEN
      NEW.technician_payout := computed;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_payout_on_unlock ON public.service_requests;
CREATE TRIGGER trg_refresh_payout_on_unlock
BEFORE UPDATE OF technician_payout_locked ON public.service_requests
FOR EACH ROW EXECUTE FUNCTION public.refresh_payout_on_unlock();

WITH targets AS (
  SELECT id, technician_payout AS old_amount, public.resolve_service_payout_amount(id) AS new_amount
  FROM public.service_requests
  WHERE COALESCE(technician_payout_locked, false) = false
    AND COALESCE(technician_payout_overridden, false) = false
    AND public.resolve_service_payout_amount(id) IS NOT NULL
    AND ABS(technician_payout - public.resolve_service_payout_amount(id)) > 0.005
),
audit_ins AS (
  INSERT INTO public.technician_payout_audit (service_request_id, old_amount, new_amount, changed_by, reason)
  SELECT id, old_amount, new_amount, '80a4223f-7470-4e62-89a4-8d8c60a4bf7d'::uuid, 'resync_payout_after_unlock_bugfix'
  FROM targets
  RETURNING service_request_id, new_amount
)
UPDATE public.service_requests sr
SET technician_payout = a.new_amount
FROM audit_ins a
WHERE sr.id = a.service_request_id;
