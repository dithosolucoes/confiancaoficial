ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS labor_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS labor_rejected_at timestamptz;