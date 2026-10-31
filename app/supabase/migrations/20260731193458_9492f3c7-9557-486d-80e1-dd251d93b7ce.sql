-- 1) Fix invalid placeholder reference in guard trigger
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
  IF uid IS NULL THEN RETURN NEW; END IF;
  IF public.is_gestor(uid) THEN RETURN NEW; END IF;

  is_tech := (uid = OLD.technician_id)
             OR (OLD.status = 'pending' AND public.is_approved_technician(uid));

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

  IF NOT is_tech THEN
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

-- 2) Scope policies that call SECURITY DEFINER helpers to authenticated only
ALTER POLICY "Gestor can view all materials" ON public.service_materials TO authenticated;
ALTER POLICY "Gestor can manage all materials" ON public.service_materials TO authenticated;
ALTER POLICY "Gestors can manage service reports" ON storage.objects TO authenticated;
ALTER POLICY "Gestor can manage all conversations" ON public.chat_conversations TO authenticated;
ALTER POLICY "Gestor can manage all messages" ON public.chat_messages TO authenticated;
ALTER POLICY "Gestor can view all ratings" ON public.service_ratings TO authenticated;
ALTER POLICY "Gestor can manage all orgs" ON public.partner_organizations TO authenticated;
ALTER POLICY "Gestor can manage all members" ON public.partner_members TO authenticated;
ALTER POLICY "Members can view org members" ON public.partner_members TO authenticated;
ALTER POLICY "Members can view own org" ON public.partner_organizations TO authenticated;
ALTER POLICY "Gestor can insert history" ON public.service_materials_history TO authenticated;
ALTER POLICY "Gestor can view history" ON public.service_materials_history TO authenticated;
ALTER POLICY "Gestor can manage all quote parts items" ON public.quote_parts_items TO authenticated;
ALTER POLICY "Partner members can view org quote parts items" ON public.quote_parts_items TO authenticated;
ALTER POLICY "Technicians can view pending requests" ON public.service_requests TO authenticated;
ALTER POLICY "Restrict service_requests visibility" ON public.service_requests TO authenticated;
ALTER POLICY "Gestor manage return visits" ON public.service_return_visits TO authenticated;
ALTER POLICY "View return visits for accessible services" ON public.service_return_visits TO authenticated;
ALTER POLICY "Gestor manage schedule events" ON public.service_schedule_events TO authenticated;
ALTER POLICY "View schedule events for accessible services" ON public.service_schedule_events TO authenticated;

-- 3) Lock down SECURITY DEFINER functions
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END $$;

-- Re-grant only what the app / RLS policies need, to authenticated
GRANT EXECUTE ON FUNCTION public.is_gestor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_approved_technician(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_org_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_partner_user_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_partner_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_service_media(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_service_technician(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_preview_open_batch_reconciliation() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_execute_open_batch_reconciliation() TO authenticated;