CREATE OR REPLACE FUNCTION public.refresh_payout_on_fixed_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  computed numeric;
BEGIN
  IF NEW.fixed_payout_amount IS DISTINCT FROM OLD.fixed_payout_amount THEN
    computed := public.resolve_service_payout_amount(NEW.id);
    IF computed IS NOT NULL THEN
      NEW.technician_payout := computed;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_payout_on_fixed_change ON public.service_requests;
CREATE TRIGGER trg_refresh_payout_on_fixed_change
BEFORE UPDATE OF fixed_payout_amount ON public.service_requests
FOR EACH ROW EXECUTE FUNCTION public.refresh_payout_on_fixed_change();