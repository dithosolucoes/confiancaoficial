
-- Create partner organizations table
CREATE TABLE public.partner_organizations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.partner_organizations ENABLE ROW LEVEL SECURITY;

-- Create partner members table
CREATE TABLE public.partner_members (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.partner_organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(organization_id, user_id)
);

ALTER TABLE public.partner_members ENABLE ROW LEVEL SECURITY;

-- Now add RLS policies (both tables exist)
CREATE POLICY "Members can view own org" ON public.partner_organizations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.partner_members pm
      WHERE pm.organization_id = partner_organizations.id
        AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Gestor can manage all orgs" ON public.partner_organizations
  FOR ALL USING (is_gestor(auth.uid()));

CREATE POLICY "Members can view own membership" ON public.partner_members
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Members can view org members" ON public.partner_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.partner_members pm2
      WHERE pm2.organization_id = partner_members.organization_id
        AND pm2.user_id = auth.uid()
    )
  );

CREATE POLICY "Gestor can manage all members" ON public.partner_members
  FOR ALL USING (is_gestor(auth.uid()));

-- Partner org members can see each other's service requests
CREATE POLICY "Partner org members can view org services"
  ON public.service_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.partner_members my_mem
      JOIN public.partner_members other_mem 
        ON other_mem.organization_id = my_mem.organization_id
      WHERE my_mem.user_id = auth.uid()
        AND other_mem.user_id = service_requests.customer_id
    )
  );

-- Insert Berens Estate Management and link emails
DO $$
DECLARE
  org_id uuid;
  uid1 uuid;
  uid2 uuid;
BEGIN
  INSERT INTO public.partner_organizations (name) VALUES ('Berens Estate Management') RETURNING id INTO org_id;

  SELECT user_id INTO uid1 FROM public.profiles WHERE email = 'joao.r@bemcoliving.com' LIMIT 1;
  SELECT user_id INTO uid2 FROM public.profiles WHERE email = 'gabriela.f@bemcoliving.com' LIMIT 1;

  IF uid1 IS NOT NULL THEN
    INSERT INTO public.partner_members (organization_id, user_id) VALUES (org_id, uid1);
  END IF;
  IF uid2 IS NOT NULL THEN
    INSERT INTO public.partner_members (organization_id, user_id) VALUES (org_id, uid2);
  END IF;
END $$;
