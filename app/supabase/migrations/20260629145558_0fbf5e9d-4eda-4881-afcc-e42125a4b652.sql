
-- =====================================================================
-- Correção definitiva dos lotes de pagamento ao técnico
-- 1) Trigger ao mover serviço sincroniza lote de ORIGEM e DESTINO
-- 2) Trigger nos itens (insert/update/delete) reconcilia lote afetado
-- 3) Função pública de reconciliação global
-- =====================================================================

-- -------- 1. Helper de recálculo de um lote -------------------------
CREATE OR REPLACE FUNCTION public.recalc_payout_batch(_batch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sum numeric;
  v_count integer;
  v_payable uuid;
  v_status text;
BEGIN
  IF _batch_id IS NULL THEN RETURN; END IF;

  SELECT COALESCE(SUM(amount),0), COUNT(*)
    INTO v_sum, v_count
  FROM public.technician_payout_batch_items
  WHERE batch_id = _batch_id;

  SELECT payable_id, status INTO v_payable, v_status
  FROM public.technician_payout_batches WHERE id = _batch_id;

  UPDATE public.technician_payout_batches
     SET total_amount = v_sum, updated_at = now()
   WHERE id = _batch_id;

  IF v_payable IS NOT NULL THEN
    -- Só sincroniza accounts_payable se ainda não foi pago
    UPDATE public.accounts_payable
       SET total_amount = v_sum, updated_at = now()
     WHERE id = v_payable
       AND status <> 'pago';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.recalc_payout_batch(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recalc_payout_batch(uuid) TO service_role;

-- -------- 2. Corrigir handle_tech_payout_liberado -------------------
-- Recalcula SEMPRE o lote de origem quando o item é movido/removido.
CREATE OR REPLACE FUNCTION public.handle_tech_payout_liberado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
              'outros', 0, v_pr.period_end, 'pendente',
              'Lote automático de pagamento ao técnico')
      RETURNING id INTO v_payable_id;

      INSERT INTO public.technician_payout_batches
        (technician_id, period_type, period_start, period_end, label, status, payable_id)
      VALUES (NEW.technician_id, v_period, v_pr.period_start, v_pr.period_end, v_pr.label, 'open', v_payable_id)
      RETURNING id INTO v_batch_id;

      UPDATE public.accounts_payable SET source_batch_id = v_batch_id WHERE id = v_payable_id;
    END IF;

    -- Captura o lote antigo (se existir) ANTES de mover
    SELECT batch_id INTO v_old_batch_id
    FROM public.technician_payout_batch_items
    WHERE service_request_id = NEW.id;

    INSERT INTO public.technician_payout_batch_items (batch_id, service_request_id, amount)
    VALUES (v_batch_id, NEW.id, v_amount)
    ON CONFLICT (service_request_id) DO UPDATE
      SET amount = EXCLUDED.amount, batch_id = EXCLUDED.batch_id;

    -- Recalcula DESTINO e (se diferente) ORIGEM
    PERFORM public.recalc_payout_batch(v_batch_id);
    IF v_old_batch_id IS NOT NULL AND v_old_batch_id <> v_batch_id THEN
      PERFORM public.recalc_payout_batch(v_old_batch_id);
    END IF;
  END IF;

  -- Reversão: limpar received_at remove dos lotes abertos
  IF TG_OP = 'UPDATE' AND NEW.received_at IS NULL AND OLD.received_at IS NOT NULL THEN
    -- Capturar lotes afetados antes de apagar
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
$$;

-- -------- 3. Trigger de integridade nos batch_items -----------------
-- Garante que QUALQUER alteração nos itens reconcilia o(s) lote(s).
CREATE OR REPLACE FUNCTION public.tg_sync_batch_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.recalc_payout_batch(NEW.batch_id);
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public.recalc_payout_batch(NEW.batch_id);
    IF NEW.batch_id IS DISTINCT FROM OLD.batch_id THEN
      PERFORM public.recalc_payout_batch(OLD.batch_id);
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.recalc_payout_batch(OLD.batch_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_batch_totals ON public.technician_payout_batch_items;
CREATE TRIGGER trg_sync_batch_totals
AFTER INSERT OR UPDATE OR DELETE ON public.technician_payout_batch_items
FOR EACH ROW EXECUTE FUNCTION public.tg_sync_batch_totals();

-- -------- 4. Reconciliação global ------------------------------------
CREATE OR REPLACE FUNCTION public.reconcile_all_payout_batches()
RETURNS TABLE(analyzed integer, corrected integer, deleted integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  v_sum numeric;
  v_count integer;
  v_analyzed integer := 0;
  v_corrected integer := 0;
  v_deleted integer := 0;
BEGIN
  FOR r IN
    SELECT b.id, b.total_amount, b.status, b.payable_id
    FROM public.technician_payout_batches b
  LOOP
    v_analyzed := v_analyzed + 1;

    SELECT COALESCE(SUM(amount),0), COUNT(*)
      INTO v_sum, v_count
    FROM public.technician_payout_batch_items
    WHERE batch_id = r.id;

    IF COALESCE(r.total_amount,0) <> v_sum THEN
      UPDATE public.technician_payout_batches
         SET total_amount = v_sum, updated_at = now()
       WHERE id = r.id;
      IF r.payable_id IS NOT NULL THEN
        UPDATE public.accounts_payable
           SET total_amount = v_sum, updated_at = now()
         WHERE id = r.payable_id AND status <> 'pago';
      END IF;
      v_corrected := v_corrected + 1;
    END IF;

    -- Lote vazio, aberto, sem pagamento → remover (e payable órfão)
    IF v_count = 0 AND r.status = 'open' THEN
      DELETE FROM public.technician_payout_batches WHERE id = r.id;
      IF r.payable_id IS NOT NULL THEN
        DELETE FROM public.accounts_payable
         WHERE id = r.payable_id AND status <> 'pago' AND COALESCE(paid_amount,0) = 0;
      END IF;
      v_deleted := v_deleted + 1;
    END IF;
  END LOOP;

  analyzed := v_analyzed;
  corrected := v_corrected;
  deleted := v_deleted;
  RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reconcile_all_payout_batches() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_all_payout_batches() TO service_role, authenticated;

-- -------- 5. Executa reconciliação imediata --------------------------
SELECT * FROM public.reconcile_all_payout_batches();
