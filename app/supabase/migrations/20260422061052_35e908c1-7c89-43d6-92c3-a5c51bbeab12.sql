CREATE POLICY "Partner members can insert org services"
ON public.service_requests
FOR INSERT
TO authenticated
WITH CHECK (
  customer_id IN (
    SELECT get_partner_user_ids(auth.uid()) AS get_partner_user_ids
  )
);