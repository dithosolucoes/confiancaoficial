
-- 1. mileage_trips
CREATE TABLE public.mileage_trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id uuid NOT NULL,
  service_request_id uuid REFERENCES public.service_requests(id) ON DELETE SET NULL,
  trip_type text NOT NULL CHECK (trip_type IN ('office_to_client','client_to_client','client_to_office')),
  origin_address text,
  origin_lat numeric,
  origin_lng numeric,
  destination_address text,
  destination_lat numeric,
  destination_lng numeric,
  distance_km numeric NOT NULL DEFAULT 0,
  duration_minutes integer,
  reference text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  manual_override boolean NOT NULL DEFAULT false,
  overridden_by uuid,
  override_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mileage_trips TO authenticated;
GRANT ALL ON public.mileage_trips TO service_role;

ALTER TABLE public.mileage_trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Technicians view own trips"
  ON public.mileage_trips FOR SELECT TO authenticated
  USING (technician_id = auth.uid() OR public.is_gestor(auth.uid()));

CREATE POLICY "Technicians insert own trips"
  ON public.mileage_trips FOR INSERT TO authenticated
  WITH CHECK (technician_id = auth.uid() OR public.is_gestor(auth.uid()));

CREATE POLICY "Gestor updates trips"
  ON public.mileage_trips FOR UPDATE TO authenticated
  USING (public.is_gestor(auth.uid()))
  WITH CHECK (public.is_gestor(auth.uid()));

CREATE POLICY "Gestor deletes trips"
  ON public.mileage_trips FOR DELETE TO authenticated
  USING (public.is_gestor(auth.uid()));

CREATE INDEX idx_mileage_trips_tech_date ON public.mileage_trips (technician_id, started_at);
CREATE INDEX idx_mileage_trips_service ON public.mileage_trips (service_request_id);

CREATE TRIGGER trg_mileage_trips_updated_at
  BEFORE UPDATE ON public.mileage_trips
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. mileage_settings (singleton row)
CREATE TABLE public.mileage_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_per_km numeric NOT NULL DEFAULT 0.40,
  office_address text NOT NULL DEFAULT 'Avenida Pinhal do Vidal, nº 30, Corroios',
  office_lat numeric NOT NULL DEFAULT 38.6450,
  office_lng numeric NOT NULL DEFAULT -9.1580,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.mileage_settings TO authenticated;
GRANT UPDATE, INSERT ON public.mileage_settings TO authenticated;
GRANT ALL ON public.mileage_settings TO service_role;

ALTER TABLE public.mileage_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated read settings"
  ON public.mileage_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Gestor manages settings"
  ON public.mileage_settings FOR ALL TO authenticated
  USING (public.is_gestor(auth.uid()))
  WITH CHECK (public.is_gestor(auth.uid()));

CREATE TRIGGER trg_mileage_settings_updated_at
  BEFORE UPDATE ON public.mileage_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.mileage_settings (rate_per_km) VALUES (0.40);

-- 3. mileage_audit
CREATE TABLE public.mileage_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid REFERENCES public.mileage_trips(id) ON DELETE CASCADE,
  setting_id uuid REFERENCES public.mileage_settings(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  old_value text,
  new_value text,
  reason text,
  changed_by uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.mileage_audit TO authenticated;
GRANT ALL ON public.mileage_audit TO service_role;

ALTER TABLE public.mileage_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestor reads audit"
  ON public.mileage_audit FOR SELECT TO authenticated
  USING (public.is_gestor(auth.uid()));

CREATE POLICY "Authenticated insert audit"
  ON public.mileage_audit FOR INSERT TO authenticated
  WITH CHECK (changed_by = auth.uid());

-- 4. service_requests new column
ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS returned_to_office_at timestamptz;
