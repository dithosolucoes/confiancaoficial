SELECT id, reference, status
FROM public.service_requests
WHERE is_warranty = true AND status = 'payment_pending';
