CREATE POLICY "Technicians can view completed requests"
ON public.service_requests
FOR SELECT
USING (auth.uid() = technician_id AND status = 'completed');