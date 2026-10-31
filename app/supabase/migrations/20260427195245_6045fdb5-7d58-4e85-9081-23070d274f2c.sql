-- 1. Add is_approved column
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_approved boolean NOT NULL DEFAULT true;

-- 2. Existing technicians: keep approved (true). New technicians will get false via trigger.
-- Ensure existing technician accounts remain approved
UPDATE public.profiles SET is_approved = true WHERE user_type = 'technician' AND is_approved IS DISTINCT FROM true;

-- 3. Replace handle_new_user to set is_approved = false for new technicians
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  resolved_type text;
BEGIN
  resolved_type := CASE
    WHEN COALESCE(NEW.raw_user_meta_data->>'user_type', 'customer') = 'gestor'
         AND NEW.email NOT IN ('confiancaversatilidade@gmail.com', 'ifoundlx.adm@gmail.com')
    THEN 'customer'
    ELSE COALESCE(NEW.raw_user_meta_data->>'user_type', 'customer')
  END;

  INSERT INTO public.profiles (user_id, full_name, user_type, email, is_approved)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    resolved_type,
    COALESCE(NEW.email, ''),
    CASE WHEN resolved_type = 'technician' THEN false ELSE true END
  );
  RETURN NEW;
END;
$function$;

-- 4. Helper function: is the user an approved technician?
CREATE OR REPLACE FUNCTION public.is_approved_technician(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id
      AND user_type = 'technician'
      AND is_approved = true
  )
$function$;

-- 5. Update RLS on service_requests so non-approved techs can't see pending pool
DROP POLICY IF EXISTS "Technicians can view pending requests" ON public.service_requests;
CREATE POLICY "Technicians can view pending requests"
ON public.service_requests
FOR SELECT
USING (
  status = 'pending'
  AND technician_id IS NULL
  AND public.is_approved_technician(auth.uid())
);

DROP POLICY IF EXISTS "Restrict service_requests visibility" ON public.service_requests;
CREATE POLICY "Restrict service_requests visibility"
ON public.service_requests
AS RESTRICTIVE
FOR SELECT
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
);

-- 6. Prevent non-approved techs from updating/accepting pending requests
DROP POLICY IF EXISTS "Technicians can update requests" ON public.service_requests;
CREATE POLICY "Technicians can update requests"
ON public.service_requests
FOR UPDATE
USING (
  auth.uid() = technician_id
  OR (status = 'pending' AND public.is_approved_technician(auth.uid()))
);