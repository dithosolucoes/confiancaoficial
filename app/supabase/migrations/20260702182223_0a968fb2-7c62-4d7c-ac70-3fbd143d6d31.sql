
-- 1) Avaliação do cliente NÃO bloqueia mais o pagamento — apenas grava snapshot informativo
CREATE OR REPLACE FUNCTION public.lock_payout_on_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  sr record;
BEGIN
  SELECT id, technician_payout, technician_payout_locked, technician_payout_overridden
    INTO sr FROM public.service_requests WHERE id = NEW.service_request_id;

  IF sr.id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Snapshot apenas informativo do valor no momento da avaliação.
  -- Não altera technician_payout nem bloqueia o serviço.
  -- Só grava se ainda não houver snapshot para esta avaliação.
  IF NOT EXISTS (
    SELECT 1 FROM public.technician_payout_audit
    WHERE service_request_id = sr.id
      AND reason = 'snapshot_avaliacao_cliente:' || NEW.id::text
  ) THEN
    INSERT INTO public.technician_payout_audit
      (service_request_id, old_amount, new_amount, changed_by, reason)
    VALUES
      (sr.id,
       sr.technician_payout,
       COALESCE(sr.technician_payout, 0),
       NULL,
       'snapshot_avaliacao_cliente:' || NEW.id::text);
  END IF;

  RETURN NEW;
END;
$function$;

-- 2) Lote pago passa a bloquear os serviços vinculados
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
         SET status = 'paid',
             paid_at = v_paid_at,
             payment_method = NEW.payment_method,
             updated_at = now()
       WHERE id = v_batch_id;

      UPDATE public.service_requests
         SET baixa_received_at = v_paid_at
       WHERE id IN (SELECT service_request_id FROM public.technician_payout_batch_items WHERE batch_id = v_batch_id)
         AND baixa_received_at IS NULL;

      -- Bloqueio real do pagamento ao técnico: apenas após consolidação financeira (lote pago)
      UPDATE public.service_requests
         SET technician_payout_locked = true
       WHERE id IN (SELECT service_request_id FROM public.technician_payout_batch_items WHERE batch_id = v_batch_id)
         AND COALESCE(technician_payout_locked, false) = false;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'pago' AND NEW.status IS DISTINCT FROM 'pago' THEN
    UPDATE public.technician_payout_batches
       SET status = 'open', paid_at = NULL, updated_at = now()
     WHERE payable_id = NEW.id;
    -- Nota: não desbloqueamos automaticamente por segurança (auditoria/decisão manual).
  END IF;

  RETURN NEW;
END;
$function$;

-- 3) fixed_payout_amount não pode alterar silenciosamente pagamento bloqueado/overridden
CREATE OR REPLACE FUNCTION public.refresh_payout_on_fixed_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  computed numeric;
BEGIN
  -- Respeitar lock e override manual — não recalcular automaticamente
  IF COALESCE(NEW.technician_payout_locked, false) THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.technician_payout_overridden, false) THEN
    RETURN NEW;
  END IF;

  IF NEW.fixed_payout_amount IS DISTINCT FROM OLD.fixed_payout_amount THEN
    computed := public.resolve_service_payout_amount(NEW.id);
    IF computed IS NOT NULL THEN
      NEW.technician_payout := computed;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
