-- 1. Tabela de configurações de remuneração
CREATE TABLE IF NOT EXISTS public.technician_payout_rates (
  reference text PRIMARY KEY CHECK (reference IN ('WO','SR','CO')),
  amount numeric(10,2) NOT NULL CHECK (amount >= 0),
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.technician_payout_rates TO authenticated;
GRANT ALL ON public.technician_payout_rates TO service_role;

ALTER TABLE public.technician_payout_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read payout rates"
  ON public.technician_payout_rates FOR SELECT TO authenticated USING (true);

CREATE POLICY "Gestor can insert payout rates"
  ON public.technician_payout_rates FOR INSERT TO authenticated
  WITH CHECK (public.is_gestor(auth.uid()));

CREATE POLICY "Gestor can update payout rates"
  ON public.technician_payout_rates FOR UPDATE TO authenticated
  USING (public.is_gestor(auth.uid()))
  WITH CHECK (public.is_gestor(auth.uid()));

INSERT INTO public.technician_payout_rates (reference, amount) VALUES
  ('WO', 25.00), ('SR', 20.00), ('CO', 25.00)
ON CONFLICT (reference) DO NOTHING;

-- 2. Colunas em service_requests
ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS technician_payout numeric(10,2),
  ADD COLUMN IF NOT EXISTS technician_payout_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS technician_payout_overridden boolean NOT NULL DEFAULT false;

-- 3. Tabela de auditoria
CREATE TABLE IF NOT EXISTS public.technician_payout_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id uuid NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  old_amount numeric(10,2),
  new_amount numeric(10,2) NOT NULL,
  changed_by uuid NOT NULL REFERENCES auth.users(id),
  changed_at timestamptz NOT NULL DEFAULT now(),
  reason text
);

GRANT SELECT, INSERT ON public.technician_payout_audit TO authenticated;
GRANT ALL ON public.technician_payout_audit TO service_role;

ALTER TABLE public.technician_payout_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestor can read payout audit"
  ON public.technician_payout_audit FOR SELECT TO authenticated
  USING (public.is_gestor(auth.uid()));

CREATE POLICY "Gestor can insert payout audit"
  ON public.technician_payout_audit FOR INSERT TO authenticated
  WITH CHECK (public.is_gestor(auth.uid()) AND changed_by = auth.uid());

CREATE POLICY "Technician can read own payout audit"
  ON public.technician_payout_audit FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.service_requests sr
      WHERE sr.id = service_request_id AND sr.technician_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_payout_audit_service ON public.technician_payout_audit(service_request_id);