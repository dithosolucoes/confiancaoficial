
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
    AND pm2.user_id != _user_id
$$;
