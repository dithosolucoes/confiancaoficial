ALTER TABLE public.service_requests 
  ADD COLUMN IF NOT EXISTS labor_paid_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS materials_paid_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS booking_paid_at timestamp with time zone;