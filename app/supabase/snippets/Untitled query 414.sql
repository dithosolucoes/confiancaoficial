  select id, reference, status from service_requests
  where is_warranty = true and status = 'payment_pending'
  and not exists (select 1 from service_payments p where p.service_request_id = service_requests.id and p.amount > 0);
  