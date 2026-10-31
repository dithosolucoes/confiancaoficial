ALTER TABLE public.service_requests 
ADD COLUMN IF NOT EXISTS equipment_working BOOLEAN,
ADD COLUMN IF NOT EXISTS cash_payment BOOLEAN,
ADD COLUMN IF NOT EXISTS cash_payment_amount NUMERIC;