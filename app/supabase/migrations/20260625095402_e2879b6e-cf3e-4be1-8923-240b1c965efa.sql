
ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS quote_payment_method text,
  ADD COLUMN IF NOT EXISTS quote_payment_note text,
  ADD COLUMN IF NOT EXISTS quote_payment_amount numeric,
  ADD COLUMN IF NOT EXISTS quote_payment_marked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quote_payment_source text;

COMMENT ON COLUMN public.service_requests.quote_payment_source IS 'Source of payment confirmation: ''link'' (Stripe webhook) or ''manual'' (gestor marked as paid)';
