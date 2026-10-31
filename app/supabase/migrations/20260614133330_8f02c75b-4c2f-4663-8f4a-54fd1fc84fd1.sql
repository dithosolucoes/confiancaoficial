-- 1. Flag por servico para regras antigas (markup pecas x1.30 cliente)
ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS legacy_parts_markup boolean NOT NULL DEFAULT false;

-- 2. Auditoria de correcoes financeiras
CREATE TABLE IF NOT EXISTS public.financial_legacy_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id uuid NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  partner_organization_id uuid REFERENCES public.partner_organizations(id),
  applied_by uuid REFERENCES auth.users(id),
  previous_config jsonb NOT NULL,
  restored_config jsonb NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.financial_legacy_audit TO authenticated;
GRANT ALL ON public.financial_legacy_audit TO service_role;

ALTER TABLE public.financial_legacy_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestor reads audit" ON public.financial_legacy_audit
  FOR SELECT TO authenticated
  USING (public.is_gestor(auth.uid()));

CREATE POLICY "Gestor inserts audit" ON public.financial_legacy_audit
  FOR INSERT TO authenticated
  WITH CHECK (public.is_gestor(auth.uid()));

-- 3. Backfill: marcar servicos do Berens Estate Management anteriores a 15/06/2026
WITH berens AS (
  SELECT id FROM public.partner_organizations WHERE name = 'Berens Estate Management'
),
members AS (
  SELECT user_id FROM public.partner_members
  WHERE organization_id IN (SELECT id FROM berens)
),
target AS (
  SELECT id FROM public.service_requests
  WHERE customer_id IN (SELECT user_id FROM members)
    AND created_at < '2026-06-15'::timestamptz
)
UPDATE public.service_requests sr
SET legacy_parts_markup = true
FROM target
WHERE sr.id = target.id;

-- 4. Registo de auditoria (uma linha por servico afetado)
INSERT INTO public.financial_legacy_audit
  (service_request_id, partner_organization_id, previous_config, restored_config, reason)
SELECT
  sr.id,
  (SELECT id FROM public.partner_organizations WHERE name = 'Berens Estate Management'),
  jsonb_build_object('parts_markup', 1.00, 'note', 'Novas regras (sem markup de 30% nas pecas) aplicadas em 13-14/06/2026'),
  jsonb_build_object('parts_markup', 1.30, 'note', 'Restauradas regras antigas: pecas cobradas ao cliente com markup x1.30'),
  'Correcao retroativa: parceiro Berens Estate Management mantem regras antigas para servicos anteriores a 15/06/2026.'
FROM public.service_requests sr
WHERE sr.legacy_parts_markup = true
  AND sr.customer_id IN (
    SELECT pm.user_id FROM public.partner_members pm
    JOIN public.partner_organizations po ON po.id = pm.organization_id
    WHERE po.name = 'Berens Estate Management'
  );