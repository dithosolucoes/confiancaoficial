
-- Allow partner org members to soft-delete (update deleted_at) on org services
CREATE POLICY "Partner members can update org services"
  ON public.service_requests
  FOR UPDATE
  TO authenticated
  USING (
    customer_id IN (SELECT public.get_partner_user_ids(auth.uid()))
  )
  WITH CHECK (
    customer_id IN (SELECT public.get_partner_user_ids(auth.uid()))
  );
