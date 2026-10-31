-- Allow partner organization members to view materials for their org's services
CREATE POLICY "Partner members can view org materials"
ON public.service_materials
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.service_requests sr
    WHERE sr.id = service_materials.service_request_id
      AND sr.customer_id IN (SELECT public.get_partner_user_ids(auth.uid()))
  )
);

-- Allow partner organization members to approve/reject materials for their org's services
CREATE POLICY "Partner members can approve or reject org materials"
ON public.service_materials
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.service_requests sr
    WHERE sr.id = service_materials.service_request_id
      AND sr.customer_id IN (SELECT public.get_partner_user_ids(auth.uid()))
  )
);