ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS quote_part_arrival_date date,
  ADD COLUMN IF NOT EXISTS quote_supplier_cost numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quote_supplier_invoice_url text;