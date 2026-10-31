CREATE OR REPLACE FUNCTION public.handle_payable_paid_for_batch()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_batch_id uuid;
  v_paid_at timestamptz;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = 'pago' AND (OLD.status IS DISTINCT FROM 'pago') THEN
    SELECT id INTO v_batch_id FROM public.technician_payout_batches WHERE payable_id = NEW.id;
    IF v_batch_id IS NOT NULL THEN
      v_paid_at := COALESCE(NEW.paid_at, now());
      UPDATE public.technician_payout_batches
         SET status = 'paid', paid_at = v_paid_at, payment_method = NEW.payment_method, updated_at = now()
       WHERE id = v_batch_id;
      UPDATE public.service_requests
         SET baixa_received_at = v_paid_at
       WHERE id IN (SELECT service_request_id FROM public.technician_payout_batch_items WHERE batch_id = v_batch_id)
         AND baixa_received_at IS NULL;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'pago' AND NEW.status IS DISTINCT FROM 'pago' THEN
    UPDATE public.technician_payout_batches
       SET status = 'open', paid_at = NULL, updated_at = now()
     WHERE payable_id = NEW.id;
  END IF;

  RETURN NEW;
END$function$;