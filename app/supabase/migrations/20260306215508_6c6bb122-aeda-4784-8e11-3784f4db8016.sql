CREATE POLICY "Technicians can update own materials"
ON public.service_materials
FOR UPDATE
TO authenticated
USING (auth.uid() = technician_id)
WITH CHECK (auth.uid() = technician_id);