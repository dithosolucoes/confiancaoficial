-- Pagamento manual do gestor passa pelo mesmo ponto único (confirmar_pagamento, migração 20261101000700).
-- Antes, o botão "Marcar como Pago" gravava direto em service_requests e o ledger ficava sem o lançamento.

ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS quote_payment_note text,
  ADD COLUMN IF NOT EXISTS quote_payment_amount numeric,
  ADD COLUMN IF NOT EXISTS quote_payment_marked_by uuid;

CREATE OR REPLACE FUNCTION public.registrar_pagamento_manual(
  _service_id UUID,
  _payment_type TEXT,
  _amount NUMERIC,
  _expected_amount NUMERIC,
  _method TEXT,
  _reference TEXT DEFAULT NULL,
  _note TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_gestor(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas o gestor pode registrar pagamento manual';
  END IF;
  IF _method IS NULL OR length(trim(_method)) = 0 THEN
    RAISE EXCEPTION 'Informe o método de pagamento';
  END IF;

  _id := public.confirmar_pagamento(
    _service_id, _payment_type, _amount, _expected_amount, _method, 'manual', _reference, auth.uid()
  );

  IF _payment_type = 'quote' THEN
    UPDATE public.service_requests
       SET quote_payment_note = NULLIF(trim(COALESCE(_note, '')), ''),
           quote_payment_amount = _amount,
           quote_payment_marked_by = auth.uid()
     WHERE id = _service_id;
  END IF;

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_pagamento_manual(UUID, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_pagamento_manual(UUID, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT) TO authenticated;
