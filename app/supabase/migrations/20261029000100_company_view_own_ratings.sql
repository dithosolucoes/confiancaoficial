-- Empresa parceira (company_admin) lê as avaliações dos serviços que lhe foram atribuídos.
-- Sem esta política o painel da empresa não consegue calcular a avaliação média.
DROP POLICY IF EXISTS "Company admins can view ratings for their services" ON public.service_ratings;
CREATE POLICY "Company admins can view ratings for their services"
ON public.service_ratings FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1
  FROM public.service_requests sr
  JOIN public.profiles p ON p.user_id = auth.uid()
  WHERE sr.id = service_ratings.service_request_id
    AND p.user_type = 'company_admin'
    AND p.company_id IS NOT NULL
    AND sr.assigned_company_id = p.company_id
));
