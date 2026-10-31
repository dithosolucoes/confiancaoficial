-- Update trigger function to use 'tecnicos' for new technician payout payables
CREATE OR REPLACE FUNCTION public.handle_tech_payout_liberado()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_period text;
  v_amount numeric;
  v_tech_name text;
  v_pr record;
  v_batch_id uuid;
  v_payable_id uuid;
  v_ref_date date;
  v_old_batch_id uuid;
BEGIN
  IF NEW.received_at IS NOT NULL
     AND NEW.baixa_received_at IS NULL
     AND NEW.technician_id IS NOT NULL
     AND COALESCE(NEW.technician_payout,0) > 0
     AND (TG_OP = 'INSERT' OR OLD.received_at IS NULL OR OLD.received_at IS DISTINCT FROM NEW.received_at
          OR OLD.technician_id IS DISTINCT FROM NEW.technician_id
          OR OLD.technician_payout IS DISTINCT FROM NEW.technician_payout)
  THEN
    IF EXISTS (
      SELECT 1 FROM public.technician_payout_batch_items i
      JOIN public.technician_payout_batches b ON b.id = i.batch_id
      WHERE i.service_request_id = NEW.id AND b.status = 'paid'
    ) THEN
      RETURN NEW;
    END IF;

    v_amount := NEW.technician_payout;
    v_ref_date := NEW.received_at::date;

    SELECT period_type INTO v_period FROM public.technician_payout_settings LIMIT 1;
    v_period := COALESCE(v_period, 'monthly');

    SELECT * INTO v_pr FROM public.compute_payout_period(v_ref_date, v_period);
    SELECT full_name INTO v_tech_name FROM public.profiles WHERE user_id = NEW.technician_id;
    v_tech_name := COALESCE(NULLIF(v_tech_name,''), 'Técnico');

    SELECT id, payable_id INTO v_batch_id, v_payable_id
    FROM public.technician_payout_batches
    WHERE technician_id = NEW.technician_id
      AND period_type = v_period
      AND period_start = v_pr.period_start
      AND status = 'open'
    LIMIT 1;

    IF v_batch_id IS NULL THEN
      INSERT INTO public.accounts_payable (description, category, total_amount, due_date, status, notes)
      VALUES ('Pagamento Técnico ' || v_tech_name || ' — ' || v_pr.label,
              'tecnicos', 0, v_pr.period_end, 'pendente',
              'Lote automático de pagamento ao técnico')
      RETURNING id INTO v_payable_id;

      INSERT INTO public.technician_payout_batches
        (technician_id, period_type, period_start, period_end, label, status, payable_id)
      VALUES (NEW.technician_id, v_period, v_pr.period_start, v_pr.period_end, v_pr.label, 'open', v_payable_id)
      RETURNING id INTO v_batch_id;

      UPDATE public.accounts_payable SET source_batch_id = v_batch_id WHERE id = v_payable_id;
    END IF;

    SELECT batch_id INTO v_old_batch_id
    FROM public.technician_payout_batch_items
    WHERE service_request_id = NEW.id;

    INSERT INTO public.technician_payout_batch_items (batch_id, service_request_id, amount)
    VALUES (v_batch_id, NEW.id, v_amount)
    ON CONFLICT (service_request_id) DO UPDATE
      SET amount = EXCLUDED.amount, batch_id = EXCLUDED.batch_id;

    PERFORM public.recalc_payout_batch(v_batch_id);
    IF v_old_batch_id IS NOT NULL AND v_old_batch_id <> v_batch_id THEN
      PERFORM public.recalc_payout_batch(v_old_batch_id);
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.received_at IS NULL AND OLD.received_at IS NOT NULL THEN
    PERFORM public.recalc_payout_batch(batch_id)
      FROM (
        SELECT DISTINCT i.batch_id
        FROM public.technician_payout_batch_items i
        JOIN public.technician_payout_batches b ON b.id = i.batch_id
        WHERE i.service_request_id = NEW.id AND b.status = 'open'
      ) s;

    DELETE FROM public.technician_payout_batch_items
     WHERE service_request_id = NEW.id
       AND batch_id IN (SELECT id FROM public.technician_payout_batches WHERE status = 'open');
  END IF;

  RETURN NEW;
END;
$function$;

-- Backfill: reclassify all existing payables tied to technician payout batches
UPDATE public.accounts_payable ap
   SET category = 'tecnicos'
  FROM public.technician_payout_batches b
 WHERE b.payable_id = ap.id
   AND ap.category <> 'tecnicos';