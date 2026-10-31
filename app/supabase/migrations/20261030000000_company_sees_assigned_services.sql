-- Empresa parceira precisa ler os chamados atribuídos a ela.
-- A policy RESTRICTIVE de SELECT não tinha essa condição e, por ser AND com as permissivas,
-- bloqueava a leitura mesmo com a policy "Company admins can view their assigned services".
DROP POLICY IF EXISTS "Restrict service_requests visibility" ON public.service_requests;
CREATE POLICY "Restrict service_requests visibility"
ON public.service_requests
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  is_gestor(auth.uid())
  OR auth.uid() = customer_id
  OR auth.uid() = technician_id
  OR (
    status = 'pending'
    AND technician_id IS NULL
    AND public.is_approved_technician(auth.uid())
  )
  OR (customer_id IN (SELECT get_partner_user_ids(auth.uid())))
  OR (
    assigned_company_id IS NOT NULL
    AND assigned_company_id = public.get_user_company_id(auth.uid())
  )
);
