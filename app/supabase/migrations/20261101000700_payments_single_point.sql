-- Pagamentos: um único ponto confirma o pagamento (public.confirmar_pagamento).
--  - Modo de pagamento em platform_settings ('simulado' até a Stripe ser ligada).
--  - service_payments é lançamento: só cresce. Estorno é uma linha nova com valor negativo.
--  - payment_divergences: pagamento com valor diferente do esperado vai para o gestor.
--  - Quem chama confirmar_pagamento é só o servidor (Edge Function com service role).
--    Cliente e técnico não conseguem gravar pagamento direto.

-- 1) modo de pagamento (padrão: simulado)
INSERT INTO public.platform_settings (key, value)
SELECT 'payment_mode', '"simulado"'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.platform_settings WHERE key = 'payment_mode');

-- 2) lançamentos de pagamento
CREATE TABLE IF NOT EXISTS public.service_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id UUID NOT NULL REFERENCES public.service_requests(id) ON DELETE RESTRICT,
  payment_type TEXT NOT NULL CHECK (payment_type IN ('booking', 'quote', 'labor', 'materials', 'additional')),
  amount NUMERIC(12,2) NOT NULL,
  method TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('simulado', 'stripe', 'manual')),
  reference TEXT,
  reversal_of UUID REFERENCES public.service_payments(id) ON DELETE RESTRICT,
  reason TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT service_payments_sign_chk CHECK (
    (reversal_of IS NULL AND amount > 0)
    OR (reversal_of IS NOT NULL AND amount < 0 AND reason IS NOT NULL AND length(trim(reason)) > 0)
  )
);
CREATE INDEX IF NOT EXISTS idx_service_payments_service ON public.service_payments(service_request_id, created_at);

-- 3) divergências (valor pago diferente do esperado)
CREATE TABLE IF NOT EXISTS public.payment_divergences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id UUID NOT NULL REFERENCES public.service_requests(id) ON DELETE RESTRICT,
  payment_id UUID REFERENCES public.service_payments(id) ON DELETE RESTRICT,
  payment_type TEXT NOT NULL,
  expected_amount NUMERIC(12,2) NOT NULL,
  paid_amount NUMERIC(12,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'resolvida')),
  resolution_note TEXT,
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4) append-only
CREATE OR REPLACE FUNCTION public.block_ledger_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Lançamentos de pagamento não podem ser alterados nem apagados. Para corrigir, faça um estorno.';
END;
$$;

DROP TRIGGER IF EXISTS trg_service_payments_append_only ON public.service_payments;
CREATE TRIGGER trg_service_payments_append_only
  BEFORE UPDATE OR DELETE ON public.service_payments
  FOR EACH ROW EXECUTE FUNCTION public.block_ledger_change();

CREATE OR REPLACE FUNCTION public.block_divergence_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Divergências não podem ser apagadas; resolva a divergência.';
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_divergences_no_delete ON public.payment_divergences;
CREATE TRIGGER trg_payment_divergences_no_delete
  BEFORE DELETE ON public.payment_divergences
  FOR EACH ROW EXECUTE FUNCTION public.block_divergence_delete();

-- 5) RLS
ALTER TABLE public.service_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_divergences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Gestor lê pagamentos" ON public.service_payments;
CREATE POLICY "Gestor lê pagamentos" ON public.service_payments
  FOR SELECT TO authenticated USING (public.is_gestor(auth.uid()));

DROP POLICY IF EXISTS "Cliente lê pagamentos do seu serviço" ON public.service_payments;
CREATE POLICY "Cliente lê pagamentos do seu serviço" ON public.service_payments
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.service_requests sr
            WHERE sr.id = service_payments.service_request_id AND sr.customer_id = auth.uid())
  );

DROP POLICY IF EXISTS "Gestor lê divergências" ON public.payment_divergences;
CREATE POLICY "Gestor lê divergências" ON public.payment_divergences
  FOR SELECT TO authenticated USING (public.is_gestor(auth.uid()));

DROP POLICY IF EXISTS "Gestor resolve divergências" ON public.payment_divergences;
CREATE POLICY "Gestor resolve divergências" ON public.payment_divergences
  FOR UPDATE TO authenticated USING (public.is_gestor(auth.uid())) WITH CHECK (public.is_gestor(auth.uid()));

REVOKE ALL ON public.service_payments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.payment_divergences FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.service_payments TO authenticated;
GRANT SELECT ON public.payment_divergences TO authenticated;
GRANT UPDATE (status, resolution_note, resolved_by, resolved_at) ON public.payment_divergences TO authenticated;

-- 6) ponto único: confirma o pagamento e aplica as mesmas transições do webhook da Stripe
CREATE OR REPLACE FUNCTION public.confirmar_pagamento(
  _service_id UUID,
  _payment_type TEXT,
  _amount NUMERIC,
  _expected_amount NUMERIC,
  _method TEXT,
  _source TEXT,
  _reference TEXT DEFAULT NULL,
  _actor UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_payment_id UUID;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF _payment_type NOT IN ('booking', 'quote', 'labor', 'materials', 'additional') THEN
    RAISE EXCEPTION 'Tipo de pagamento inválido: %', _payment_type;
  END IF;
  IF _source NOT IN ('simulado', 'stripe', 'manual') THEN
    RAISE EXCEPTION 'Origem de pagamento inválida: %', _source;
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Valor do pagamento deve ser maior que zero';
  END IF;

  SELECT status INTO v_status FROM public.service_requests WHERE id = _service_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Serviço não encontrado';
  END IF;

  INSERT INTO public.service_payments (service_request_id, payment_type, amount, method, source, reference, created_by)
  VALUES (_service_id, _payment_type, round(_amount, 2), _method, _source, _reference, _actor)
  RETURNING id INTO v_payment_id;

  IF _expected_amount IS NOT NULL AND abs(_expected_amount - _amount) > 0.01 THEN
    INSERT INTO public.payment_divergences (service_request_id, payment_id, payment_type, expected_amount, paid_amount)
    VALUES (_service_id, v_payment_id, _payment_type, round(_expected_amount, 2), round(_amount, 2));
  END IF;

  IF _payment_type = 'booking' THEN
    UPDATE public.service_requests
       SET booking_paid_at = v_now,
           status = CASE WHEN v_status = 'payment_pending' THEN 'pending' ELSE status END
     WHERE id = _service_id;

  ELSIF _payment_type = 'quote' THEN
    UPDATE public.service_requests
       SET quote_paid_at = v_now,
           quote_payment_source = _source,
           quote_payment_method = _method,
           status = CASE WHEN v_status = 'quote_sent' THEN 'quote_accepted' ELSE status END,
           quote_status = CASE WHEN v_status = 'quote_sent' THEN 'accepted' ELSE quote_status END
     WHERE id = _service_id;

  ELSIF _payment_type = 'labor' THEN
    UPDATE public.service_requests
       SET labor_paid_at = v_now,
           quote_paid_at = v_now,
           quote_payment_source = _source,
           quote_payment_method = _method
     WHERE id = _service_id;

  ELSIF _payment_type = 'materials' THEN
    UPDATE public.service_materials SET status = 'approved'
     WHERE service_request_id = _service_id AND status = 'pending';
    UPDATE public.service_requests SET materials_paid_at = v_now WHERE id = _service_id;

  ELSIF _payment_type = 'additional' THEN
    UPDATE public.service_materials SET status = 'approved'
     WHERE service_request_id = _service_id AND status = 'pending';
    UPDATE public.service_requests
       SET labor_paid_at = v_now,
           quote_paid_at = v_now,
           materials_paid_at = v_now,
           quote_payment_source = _source,
           quote_payment_method = _method
     WHERE id = _service_id;
  END IF;

  RETURN v_payment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.confirmar_pagamento(UUID, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_pagamento(UUID, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, UUID) TO service_role;

-- 7) estorno: lançamento novo com valor negativo (só gestor)
CREATE OR REPLACE FUNCTION public.estornar_pagamento(_payment_id UUID, _reason TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orig public.service_payments%ROWTYPE;
  v_new UUID;
BEGIN
  IF NOT public.is_gestor(auth.uid()) THEN
    RAISE EXCEPTION 'Só o gestor pode estornar pagamentos';
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 3 THEN
    RAISE EXCEPTION 'Informe o motivo do estorno';
  END IF;
  SELECT * INTO v_orig FROM public.service_payments WHERE id = _payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pagamento não encontrado';
  END IF;
  IF v_orig.reversal_of IS NOT NULL THEN
    RAISE EXCEPTION 'Não se estorna um estorno';
  END IF;
  IF EXISTS (SELECT 1 FROM public.service_payments WHERE reversal_of = _payment_id) THEN
    RAISE EXCEPTION 'Este pagamento já foi estornado';
  END IF;
  INSERT INTO public.service_payments (service_request_id, payment_type, amount, method, source, reference, reversal_of, reason, created_by)
  VALUES (v_orig.service_request_id, v_orig.payment_type, -v_orig.amount, v_orig.method, v_orig.source, v_orig.reference, _payment_id, _reason, auth.uid())
  RETURNING id INTO v_new;
  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.estornar_pagamento(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.estornar_pagamento(UUID, TEXT) TO authenticated;
