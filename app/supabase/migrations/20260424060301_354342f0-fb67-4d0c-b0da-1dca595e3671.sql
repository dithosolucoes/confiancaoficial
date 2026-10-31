ALTER TABLE public.service_requests
ADD COLUMN IF NOT EXISTS suggested_date date,
ADD COLUMN IF NOT EXISTS suggested_time text,
ADD COLUMN IF NOT EXISTS suggested_by_technician_id uuid,
ADD COLUMN IF NOT EXISTS suggested_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS suggestion_status text;