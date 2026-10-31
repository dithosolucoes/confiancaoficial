DO $$
DECLARE
  v_gestor uuid;
  v_count integer;
BEGIN
  SELECT user_id INTO v_gestor
  FROM public.profiles
  WHERE user_type = 'gestor'
  ORDER BY created_at ASC
  LIMIT 1;

  WITH targets AS (
    SELECT sr.id, sr.technician_payout
    FROM public.service_requests sr
    WHERE COALESCE(sr.technician_payout_locked, false) = true
      AND COALESCE(sr.technician_payout_overridden, false) = false
      AND sr.received_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.technician_payout_batch_items i
        WHERE i.service_request_id = sr.id
      )
      AND ROUND(COALESCE(sr.technician_payout,0)::numeric, 2)
          = ROUND(COALESCE(public.resolve_service_payout_amount(sr.id),0)::numeric, 2)
  ),
  audit_ins AS (
    INSERT INTO public.technician_payout_audit
      (service_request_id, old_amount, new_amount, changed_by, reason)
    SELECT t.id, t.technician_payout, t.technician_payout, v_gestor,
      'unlock_orphan_safe_zero_delta: Serviço desbloqueado após reversão financeira. Valor do pagamento mantido. Nenhum recálculo executado.'
    FROM targets t
    RETURNING service_request_id
  ),
  upd AS (
    UPDATE public.service_requests sr
       SET technician_payout_locked = false
      FROM audit_ins a
     WHERE sr.id = a.service_request_id
    RETURNING sr.id
  )
  SELECT COUNT(*) INTO v_count FROM upd;

  RAISE NOTICE 'Serviços desbloqueados: %', v_count;
END $$;