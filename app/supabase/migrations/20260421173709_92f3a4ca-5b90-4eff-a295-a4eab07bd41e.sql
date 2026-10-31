DROP POLICY IF EXISTS "Restrict service_requests visibility" ON public.service_requests;

CREATE POLICY "Restrict service_requests visibility"
  ON public.service_requests
  AS RESTRICTIVE
  FOR SELECT
  TO public
  USING (
    is_gestor(auth.uid())
    OR (auth.uid() = customer_id)
    OR (auth.uid() = technician_id)
    OR (
      (status = 'pending') AND (technician_id IS NULL) AND (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.user_id = auth.uid() AND profiles.user_type = 'technician'
        )
      )
    )
    OR (
      EXISTS (
        SELECT 1 FROM partner_members my_mem
        JOIN partner_members other_mem ON other_mem.organization_id = my_mem.organization_id
        WHERE my_mem.user_id = auth.uid()
          AND other_mem.user_id = service_requests.customer_id
      )
    )
  );
