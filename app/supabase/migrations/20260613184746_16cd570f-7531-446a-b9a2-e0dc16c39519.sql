
ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS tech_on_the_way_at timestamptz,
  ADD COLUMN IF NOT EXISTS tech_eta_minutes integer,
  ADD COLUMN IF NOT EXISTS tech_eta_distance_km numeric,
  ADD COLUMN IF NOT EXISTS tech_eta_computed_at timestamptz,
  ADD COLUMN IF NOT EXISTS tech_origin_lat double precision,
  ADD COLUMN IF NOT EXISTS tech_origin_lng double precision,
  ADD COLUMN IF NOT EXISTS quote_part_received_at timestamptz;
