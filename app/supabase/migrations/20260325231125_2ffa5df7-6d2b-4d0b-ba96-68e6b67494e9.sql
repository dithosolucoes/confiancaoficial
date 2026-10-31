
DROP POLICY "Technicians can view pending requests" ON public.service_requests;

CREATE POLICY "Technicians can view pending requests"
ON public.service_requests
FOR SELECT
USING (
  status = 'pending'
  AND technician_id IS NULL
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.user_type = 'technician'
  )
);
