
ALTER TABLE public.service_requests
ADD COLUMN postal_code text NOT NULL DEFAULT '',
ADD COLUMN contact_name text NOT NULL DEFAULT '',
ADD COLUMN contact_phone text NOT NULL DEFAULT '';
