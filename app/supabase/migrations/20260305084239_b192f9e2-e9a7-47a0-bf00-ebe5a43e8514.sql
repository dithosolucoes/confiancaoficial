ALTER TABLE public.service_requests ADD COLUMN IF NOT EXISTS report_text text DEFAULT '';
ALTER TABLE public.service_requests ADD COLUMN IF NOT EXISTS started_at timestamptz DEFAULT NULL;