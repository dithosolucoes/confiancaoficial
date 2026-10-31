
-- Preview function: read-only analysis
CREATE OR REPLACE FUNCTION public.admin_preview_open_batch_reconciliation()
RETURNS TABLE(
  batch_item_id uuid,
  batch_id uuid,
  batch_label text,
  payable_id uuid,
  technician_id uuid,
  technician_name text,
  service_request_id uuid,
  service_reference text,
  current_item_amount numeric,
  official_payout numeric,
  difference numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    i.id AS batch_item_id,
    b.id AS batch_id,
    b.label AS batch_label,
    b.payable_id,
    b.technician_id,
    p.full_name AS technician_name,
    sr.id AS service_request_id,
    sr.reference AS service_reference,
    COALESCE(i.amount, 0) AS current_item_amount,
    COALESCE(sr.technician_payout, 0) AS official_payout,
    (COALESCE(sr.technician_payout, 0) - COALESCE(i.amount, 0)) AS difference
  FROM public.technician_payout_batch_items i
  JOIN public.technician_payout_batches b ON b.id = i.batch_id
  JOIN public.service_requests sr ON sr.id = i.service_request_id
  LEFT JOIN public.profiles p ON p.user_id = b.technician_id
  LEFT JOIN public.accounts_payable ap ON ap.id = b.payable_id
  WHERE b.status = 'open'
    AND (ap.id IS NULL OR ap.status <> 'pago')
    AND COALESCE(sr.technician_payout_locked, false) = false
    AND COALESCE(sr.technician_payout_overridden, false) = false
    AND COALESCE(i.amount, 0) IS DISTINCT FROM COALESCE(sr.technician_payout, 0)
  ORDER BY b.id, sr.reference;
$$;

-- Execute function: apply the sync
CREATE OR REPLACE FUNCTION public.admin_execute_open_batch_reconciliation()
RETURNS TABLE(
  items_corrected integer,
  batches_updated integer,
  payables_updated integer,
  total_delta numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_items integer := 0;
  v_delta numeric := 0;
  v_batch_ids uuid[] := ARRAY[]::uuid[];
  v_payable_ids uuid[] := ARRAY[]::uuid[];
  bid uuid;
  v_sum numeric;
  pid uuid;
  v_payables_updated integer := 0;
BEGIN
  IF NOT public.is_gestor(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas gestores podem executar a reconciliação';
  END IF;

  FOR r IN
    SELECT * FROM public.admin_preview_open_batch_reconciliation()
  LOOP
    UPDATE public.technician_payout_batch_items
       SET amount = r.official_payout
     WHERE id = r.batch_item_id;

    v_items := v_items + 1;
    v_delta := v_delta + r.difference;

    IF NOT (r.batch_id = ANY(v_batch_ids)) THEN
      v_batch_ids := v_batch_ids || r.batch_id;
    END IF;
    IF r.payable_id IS NOT NULL AND NOT (r.payable_id = ANY(v_payable_ids)) THEN
      v_payable_ids := v_payable_ids || r.payable_id;
    END IF;
  END LOOP;

  -- Recalculate batch totals (safety: recalc_payout_batch already skips paid payables)
  FOREACH bid IN ARRAY v_batch_ids LOOP
    PERFORM public.recalc_payout_batch(bid);
  END LOOP;

  v_payables_updated := array_length(v_payable_ids, 1);

  items_corrected := v_items;
  batches_updated := COALESCE(array_length(v_batch_ids, 1), 0);
  payables_updated := COALESCE(v_payables_updated, 0);
  total_delta := v_delta;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_preview_open_batch_reconciliation() FROM public;
REVOKE ALL ON FUNCTION public.admin_execute_open_batch_reconciliation() FROM public;
GRANT EXECUTE ON FUNCTION public.admin_preview_open_batch_reconciliation() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_execute_open_batch_reconciliation() TO authenticated;
