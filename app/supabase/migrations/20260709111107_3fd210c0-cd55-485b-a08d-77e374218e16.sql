
-- 1) Função de sincronização idempotente (UPSERT por source_payable_id)
CREATE OR REPLACE FUNCTION public.sync_cash_flow_from_payable(_payable_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p record;
  v_date date;
  v_used_fallback boolean := false;
BEGIN
  SELECT * INTO p FROM public.accounts_payable WHERE id = _payable_id;
  IF p.id IS NULL THEN RETURN; END IF;

  IF p.status = 'pago' THEN
    IF p.paid_at IS NOT NULL THEN
      v_date := p.paid_at::date;
    ELSE
      v_date := p.due_date;
      v_used_fallback := true;
    END IF;

    INSERT INTO public.cash_flow_entries
      (entry_date, kind, description, origin, category, supplier_id,
       payment_method, amount, status, source_payable_id, notes)
    VALUES
      (v_date, 'out', p.description,
       CASE WHEN p.source_batch_id IS NOT NULL THEN 'lote_tecnico'
            WHEN p.supplier_id IS NOT NULL THEN 'fornecedor'
            ELSE 'outro' END,
       p.category::text, p.supplier_id, p.payment_method,
       COALESCE(p.total_amount,0), 'pago', p.id,
       CASE WHEN v_used_fallback THEN 'Data de vencimento usada (paid_at ausente)' ELSE NULL END)
    ON CONFLICT (source_payable_id) WHERE source_payable_id IS NOT NULL
    DO UPDATE SET
      entry_date = EXCLUDED.entry_date,
      description = EXCLUDED.description,
      amount = EXCLUDED.amount,
      payment_method = EXCLUDED.payment_method,
      category = EXCLUDED.category,
      supplier_id = EXCLUDED.supplier_id,
      status = 'pago',
      notes = EXCLUDED.notes,
      updated_at = now();
  ELSE
    -- Reversão: preservar lançamento existente, apenas anotar
    UPDATE public.cash_flow_entries
       SET notes = COALESCE(notes || E'\n', '') ||
                   'Estorno em ' || to_char(now(),'YYYY-MM-DD HH24:MI') ||
                   ' — payable voltou para status ' || p.status::text,
           updated_at = now()
     WHERE source_payable_id = p.id;
  END IF;
END;
$$;

-- 2) Trigger AFTER INSERT/UPDATE em accounts_payable
CREATE OR REPLACE FUNCTION public.tg_sync_cash_flow_from_payable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'pago' THEN
      PERFORM public.sync_cash_flow_from_payable(NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.paid_at IS DISTINCT FROM OLD.paid_at
       OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
       OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
       OR NEW.category IS DISTINCT FROM OLD.category THEN
      PERFORM public.sync_cash_flow_from_payable(NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_cash_flow_from_payable ON public.accounts_payable;
CREATE TRIGGER trg_sync_cash_flow_from_payable
AFTER INSERT OR UPDATE ON public.accounts_payable
FOR EACH ROW EXECUTE FUNCTION public.tg_sync_cash_flow_from_payable();

-- 3) Backfill idempotente das contas pagas sem lançamento
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT id FROM public.accounts_payable
     WHERE status = 'pago'
       AND NOT EXISTS (SELECT 1 FROM public.cash_flow_entries c WHERE c.source_payable_id = accounts_payable.id)
  LOOP
    PERFORM public.sync_cash_flow_from_payable(r.id);
  END LOOP;
END $$;
