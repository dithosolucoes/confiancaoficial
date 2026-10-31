CREATE POLICY "Restrict service_requests visibility"
ON public.service_requests
AS RESTRICTIVE
FOR SELECT
TO public
USING (
  is_gestor(auth.uid())
  OR auth.uid() = customer_id
  OR auth.uid() = technician_id
  OR (
    status = 'pending'
    AND technician_id IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.user_type = 'technician'
    )
  )
);