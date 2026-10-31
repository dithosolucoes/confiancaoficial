ALTER TABLE public.service_requests 
ADD COLUMN IF NOT EXISTS quote_parts numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS quote_travel numeric DEFAULT 20;