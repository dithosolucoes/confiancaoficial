
-- Create service_materials table
CREATE TABLE public.service_materials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service_request_id UUID NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  technician_id UUID NOT NULL,
  material_name TEXT NOT NULL,
  material_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.service_materials ENABLE ROW LEVEL SECURITY;

-- Technicians can insert materials for their assigned service requests
CREATE POLICY "Technicians can add materials"
ON public.service_materials FOR INSERT
WITH CHECK (
  auth.uid() = technician_id
  AND EXISTS (
    SELECT 1 FROM public.service_requests
    WHERE id = service_request_id AND technician_id = auth.uid()
  )
);

-- Technicians can view materials they added
CREATE POLICY "Technicians can view own materials"
ON public.service_materials FOR SELECT
USING (auth.uid() = technician_id);

-- Customers can view materials for their service requests
CREATE POLICY "Customers can view materials for their requests"
ON public.service_materials FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.service_requests
    WHERE id = service_request_id AND customer_id = auth.uid()
  )
);

-- Customers can update status (approve/reject) of materials for their requests
CREATE POLICY "Customers can approve or reject materials"
ON public.service_materials FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.service_requests
    WHERE id = service_request_id AND customer_id = auth.uid()
  )
);

-- Gestor can view all materials
CREATE POLICY "Gestor can view all materials"
ON public.service_materials FOR SELECT
USING (is_gestor(auth.uid()));

-- Gestor can manage all materials
CREATE POLICY "Gestor can manage all materials"
ON public.service_materials FOR ALL
USING (is_gestor(auth.uid()));

-- Technicians can delete their pending materials
CREATE POLICY "Technicians can delete pending materials"
ON public.service_materials FOR DELETE
USING (auth.uid() = technician_id AND status = 'pending');
