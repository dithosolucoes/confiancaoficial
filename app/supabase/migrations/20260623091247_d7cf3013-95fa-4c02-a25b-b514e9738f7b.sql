
-- Service Return Visits History
CREATE TABLE public.service_return_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id uuid NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  return_date date,
  return_time text,
  technician_id uuid,
  started_at timestamptz,
  completed_at timestamptz,
  report_text text,
  report_url text,
  requested_at timestamptz,
  description text,
  status text NOT NULL DEFAULT 'archived',
  photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_request_id, sequence)
);

CREATE INDEX idx_service_return_visits_service ON public.service_return_visits(service_request_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_return_visits TO authenticated;
GRANT ALL ON public.service_return_visits TO service_role;

ALTER TABLE public.service_return_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestor manage return visits"
  ON public.service_return_visits FOR ALL
  USING (public.is_gestor(auth.uid()))
  WITH CHECK (public.is_gestor(auth.uid()));

CREATE POLICY "View return visits for accessible services"
  ON public.service_return_visits FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.service_requests sr
      WHERE sr.id = service_return_visits.service_request_id
        AND (
          public.is_gestor(auth.uid())
          OR sr.customer_id = auth.uid()
          OR sr.technician_id = auth.uid()
          OR sr.customer_id IN (SELECT public.get_partner_user_ids(auth.uid()))
        )
    )
  );

CREATE TRIGGER trg_service_return_visits_updated_at
  BEFORE UPDATE ON public.service_return_visits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
