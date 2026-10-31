
-- Security definer function to check if user is a gestor
CREATE OR REPLACE FUNCTION public.is_gestor(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id AND user_type = 'gestor'
  )
$$;

-- Gestor can view ALL profiles
CREATE POLICY "Gestor can view all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (public.is_gestor(auth.uid()));

-- Gestor can update ALL profiles
CREATE POLICY "Gestor can update all profiles"
ON public.profiles FOR UPDATE
TO authenticated
USING (public.is_gestor(auth.uid()));

-- Gestor can view ALL service requests
CREATE POLICY "Gestor can view all service requests"
ON public.service_requests FOR SELECT
TO authenticated
USING (public.is_gestor(auth.uid()));

-- Gestor can insert service requests
CREATE POLICY "Gestor can insert service requests"
ON public.service_requests FOR INSERT
TO authenticated
WITH CHECK (public.is_gestor(auth.uid()));

-- Gestor can update ALL service requests
CREATE POLICY "Gestor can update all service requests"
ON public.service_requests FOR UPDATE
TO authenticated
USING (public.is_gestor(auth.uid()));

-- Gestor can delete service requests
CREATE POLICY "Gestor can delete service requests"
ON public.service_requests FOR DELETE
TO authenticated
USING (public.is_gestor(auth.uid()));
