ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS quote_additional_description text,
  ADD COLUMN IF NOT EXISTS quote_additional_value numeric;