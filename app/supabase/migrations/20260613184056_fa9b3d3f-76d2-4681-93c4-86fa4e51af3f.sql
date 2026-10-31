ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS quote_paid_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS warranty_return_requested_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS warranty_return_description text,
  ADD COLUMN IF NOT EXISTS parent_service_id uuid REFERENCES public.service_requests(id) ON DELETE SET NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gps_lat double precision,
  ADD COLUMN IF NOT EXISTS gps_lng double precision,
  ADD COLUMN IF NOT EXISTS gps_consent_at timestamp with time zone;