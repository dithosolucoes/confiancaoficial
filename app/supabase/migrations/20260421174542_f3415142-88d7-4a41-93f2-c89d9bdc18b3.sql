
-- 1. Create a SECURITY DEFINER function to check partner membership without triggering RLS
CREATE OR REPLACE FUNCTION public.is_partner_member(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.partner_members
    WHERE user_id = _user_id AND organization_id = _org_id
  )
$$;

-- 2. Function to get org IDs for a user
CREATE OR REPLACE FUNCTION public.get_user_org_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.partner_members WHERE user_id = _user_id
$$;

-- 3. Function to get all user_ids in same orgs as a given user
CREATE OR REPLACE FUNCTION public.get_partner_user_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT pm2.user_id
  FROM public.partner_members pm1
  JOIN public.partner_members pm2 ON pm2.organization_id = pm1.organization_id
  WHERE pm1.user_id = _user_id
$$;

-- 4. Fix partner_members policies
DROP POLICY IF EXISTS "Members can view org members" ON public.partner_members;
DROP POLICY IF EXISTS "Members can view own membership" ON public.partner_members;

CREATE POLICY "Members can view own membership"
  ON public.partner_members
  FOR SELECT
  TO public
  USING (auth.uid() = user_id);

CREATE POLICY "Members can view org members"
  ON public.partner_members
  FOR SELECT
  TO public
  USING (
    organization_id IN (SELECT public.get_user_org_ids(auth.uid()))
  );

-- 5. Fix partner_organizations policy
DROP POLICY IF EXISTS "Members can view own org" ON public.partner_organizations;

CREATE POLICY "Members can view own org"
  ON public.partner_organizations
  FOR SELECT
  TO public
  USING (
    id IN (SELECT public.get_user_org_ids(auth.uid()))
  );

-- 6. Fix service_requests RESTRICTIVE policy
DROP POLICY IF EXISTS "Restrict service_requests visibility" ON public.service_requests;

CREATE POLICY "Restrict service_requests visibility"
  ON public.service_requests
  AS RESTRICTIVE
  FOR SELECT
  TO public
  USING (
    is_gestor(auth.uid())
    OR (auth.uid() = customer_id)
    OR (auth.uid() = technician_id)
    OR (
      (status = 'pending') AND (technician_id IS NULL) AND (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.user_id = auth.uid() AND profiles.user_type = 'technician'
        )
      )
    )
    OR (
      customer_id IN (SELECT public.get_partner_user_ids(auth.uid()))
    )
  );

-- 7. Fix partner org members permissive policy on service_requests
DROP POLICY IF EXISTS "Partner org members can view org services" ON public.service_requests;

CREATE POLICY "Partner org members can view org services"
  ON public.service_requests
  FOR SELECT
  TO authenticated
  USING (
    customer_id IN (SELECT public.get_partner_user_ids(auth.uid()))
  );
