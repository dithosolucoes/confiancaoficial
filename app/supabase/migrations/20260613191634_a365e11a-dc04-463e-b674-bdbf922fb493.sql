UPDATE public.service_requests
SET is_invoiced = false,
    invoice_issued_at = NULL
WHERE is_invoiced = true
  AND (invoice_number IS NULL OR btrim(invoice_number) = '');