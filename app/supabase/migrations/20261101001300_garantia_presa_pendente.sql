-- Garantias presas em "payment_pending" (decisão D9 do Thomas, 31/10/2026).
-- Garantia não cobra visita, então não há pagamento a esperar. Estes chamados entraram
-- antes da correção do formulário. Esta migração só muda o status: não mexe em valor,
-- regra, snapshot ou pagamento.
-- Entram só chamados: de garantia, em payment_pending e sem nenhum pagamento positivo registrado.

UPDATE public.service_requests sr
SET status = 'pending'
WHERE sr.is_warranty = true
  AND sr.status = 'payment_pending'
  AND NOT EXISTS (
    SELECT 1 FROM public.service_payments p
    WHERE p.service_request_id = sr.id
      AND p.amount > 0
  );
