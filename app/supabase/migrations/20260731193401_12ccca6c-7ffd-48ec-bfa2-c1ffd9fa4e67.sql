-- 1) Helper: who can access media of a service request
CREATE OR REPLACE FUNCTION public.can_access_service_media(_service_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.service_requests sr
    WHERE sr.id = _service_id
      AND (
        public.is_gestor(auth.uid())
        OR sr.customer_id = auth.uid()
        OR sr.technician_id = auth.uid()
        OR sr.customer_id IN (SELECT public.get_partner_user_ids(auth.uid()))
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.is_service_technician(_service_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.service_requests sr
    WHERE sr.id = _service_id AND sr.technician_id = auth.uid()
  )
$$;

REVOKE EXECUTE ON FUNCTION public.can_access_service_media(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_service_technician(uuid) FROM anon;

-- 2) equipment-photos storage policies
DROP POLICY IF EXISTS "Anyone can view equipment photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete equipment photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload equipment photos" ON storage.objects;

CREATE POLICY "Equipment photos viewable by related users"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'equipment-photos'
  AND public.can_access_service_media(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Equipment photos upload by related users"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'equipment-photos'
  AND public.can_access_service_media(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Equipment photos update by gestor or technician"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'equipment-photos'
  AND (public.is_gestor(auth.uid()) OR public.is_service_technician(((storage.foldername(name))[1])::uuid))
)
WITH CHECK (
  bucket_id = 'equipment-photos'
  AND (public.is_gestor(auth.uid()) OR public.is_service_technician(((storage.foldername(name))[1])::uuid))
);

CREATE POLICY "Equipment photos delete by gestor or technician"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'equipment-photos'
  AND (public.is_gestor(auth.uid()) OR public.is_service_technician(((storage.foldername(name))[1])::uuid))
);

-- 3) service-reports: restrict read to related users
DROP POLICY IF EXISTS "Authenticated users can view service reports" ON storage.objects;

CREATE POLICY "Service reports viewable by related users"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'service-reports'
  AND public.can_access_service_media(((storage.foldername(name))[1])::uuid)
);

-- 4) service_requests UPDATE policies: add WITH CHECK
DROP POLICY IF EXISTS "Customers can update own requests" ON public.service_requests;
CREATE POLICY "Customers can update own requests"
ON public.service_requests FOR UPDATE TO authenticated
USING (auth.uid() = customer_id)
WITH CHECK (auth.uid() = customer_id);

DROP POLICY IF EXISTS "Technicians can update requests" ON public.service_requests;
CREATE POLICY "Technicians can update requests"
ON public.service_requests FOR UPDATE TO authenticated
USING (
  auth.uid() = technician_id
  OR (status = 'pending' AND public.is_approved_technician(auth.uid()))
)
WITH CHECK (
  auth.uid() = technician_id
  OR (status = 'pending' AND public.is_approved_technician(auth.uid()))
);

-- 5) Column-level guard so non-gestor roles cannot change admin/financial fields
CREATE OR REPLACE FUNCTION public.guard_service_request_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  is_tech boolean;
BEGIN
  -- Service role / internal triggers (no JWT) keep full access
  IF uid IS NULL THEN RETURN NEW; END IF;
  IF public.is_gestor(uid) THEN RETURN NEW; END IF;

  is_tech := (uid = OLD.technician_id)
             OR (OLD.status = 'pending' AND public.is_approved_technician(uid));

  -- Fields nobody except gestor may change
  NEW.customer_id                  := OLD.customer_id;
  NEW.reference                    := OLD.reference;
  NEW.technician_payout            := OLD.technician_payout;
  NEW.technician_payout_locked     := OLD.technician_payout_locked;
  NEW.technician_payout_overridden := OLD.technician_payout_overridden;
  NEW.fixed_payout_amount          := OLD.fixed_payout_amount;
  NEW.deslocacao_fee               := OLD.deslocacao_fee;
  NEW.is_invoiced                  := OLD.is_invoiced;
  NEW.invoice_number               := OLD.invoice_number;
  NEW.invoice_issued_at            := OLD.invoice_issued_at;
  NEW.invoice_paid_at              := OLD.invoice_paid_at;
  NEW.received_at                  := OLD.received_at;
  NEW.baixa_received_at            := OLD.baixa_received_at;
  NEW.labor_paid_at                := OLD.labor_paid_at;
  NEW.materials_paid_at            := OLD.materials_paid_at;
  NEW.booking_paid_at              := OLD.booking_paid_at;
  NEW.quote_paid_at                := OLD.quote_paid_at;
  NEW.quote_payment_method         := OLD.quote_payment_method;
  NEW.quote_payment_note           := OLD.quote_payment_note;
  NEW.quote_payment_amount         := OLD.quote_payment_amount;
  NEW.quote_payment_marked_by      := OLD.quote_payment_marked_by;
  NEW.quote_payment_source         := OLD.quote_payment_source;
  NEW.gestor_notes                 := OLD.gestor_notes;
  NEW.gestor_private_note          := OLD.gestor_private_note;
  NEW.legacy_parts_markup          := OLD.legacy_parts_markup;
  NEW.deleted_at                   := OLD.deleted_at;
  NEW.is_partner_flagged_noop      := NULL; -- placeholder no-op removed below

  IF NOT is_tech THEN
    -- Customers / partner members: also cannot touch operational + pricing fields
    NEW.status                     := OLD.status;
    NEW.technician_id              := OLD.technician_id;
    NEW.labor_cost                 := OLD.labor_cost;
    NEW.labor_approved_at          := OLD.labor_approved_at;
    NEW.labor_rejected_at          := OLD.labor_rejected_at;
    NEW.extra_fee                  := OLD.extra_fee;
    NEW.quote_parts                := OLD.quote_parts;
    NEW.quote_travel               := OLD.quote_travel;
    NEW.quote_supplier_cost        := OLD.quote_supplier_cost;
    NEW.quote_additional_value     := OLD.quote_additional_value;
    NEW.quote_additional_cost      := OLD.quote_additional_cost;
    NEW.report_text                := OLD.report_text;
    NEW.report_url                 := OLD.report_url;
    NEW.started_at                 := OLD.started_at;
    NEW.completed_at               := OLD.completed_at;
    NEW.is_warranty                := OLD.is_warranty;
    NEW.cash_payment               := OLD.cash_payment;
    NEW.cash_payment_amount        := OLD.cash_payment_amount;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_service_request_fields ON public.service_requests;
CREATE TRIGGER trg_guard_service_request_fields
BEFORE UPDATE ON public.service_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_service_request_fields();

-- 6) Lock down SECURITY DEFINER functions that must not be callable from the API
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.recalc_payout_batch(uuid)',
    'public.recompute_service_payout(uuid)',
    'public.recalculate_all_technician_payouts()',
    'public.reconcile_all_payout_batches()',
    'public.resolve_payout_amount(text, text)',
    'public.resolve_service_payout_amount(uuid)',
    'public.sync_cash_flow_from_payable(uuid)',
    'public.guard_service_request_fields()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', fn);
  END LOOP;

  -- Admin RPCs: authenticated only (function itself checks gestor)
  EXECUTE 'REVOKE ALL ON FUNCTION public.admin_preview_open_batch_reconciliation() FROM anon';
  EXECUTE 'REVOKE ALL ON FUNCTION public.admin_execute_open_batch_reconciliation() FROM anon';
  EXECUTE 'REVOKE ALL ON FUNCTION public.is_partner_member(uuid, uuid) FROM anon';
  EXECUTE 'REVOKE ALL ON FUNCTION public.compute_payout_period(date, text) FROM anon, authenticated';
END $$;