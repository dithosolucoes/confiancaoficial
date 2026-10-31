
-- 1) Settings (singleton) ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.technician_payout_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_type text NOT NULL DEFAULT 'monthly' CHECK (period_type IN ('weekly','biweekly','monthly')),
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.technician_payout_settings TO authenticated;
GRANT ALL ON public.technician_payout_settings TO service_role;
ALTER TABLE public.technician_payout_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone authenticated can read tech payout settings"
  ON public.technician_payout_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Gestor manages tech payout settings"
  ON public.technician_payout_settings FOR ALL TO authenticated
  USING (public.is_gestor(auth.uid())) WITH CHECK (public.is_gestor(auth.uid()));

INSERT INTO public.technician_payout_settings (period_type)
SELECT 'monthly' WHERE NOT EXISTS (SELECT 1 FROM public.technician_payout_settings);

-- 2) Batches -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.technician_payout_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id uuid NOT NULL,
  period_type text NOT NULL CHECK (period_type IN ('weekly','biweekly','monthly')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  label text NOT NULL DEFAULT '',
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','paid','cancelled')),
  paid_at timestamptz,
  payment_method text,
  payable_id uuid REFERENCES public.accounts_payable(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_open_batch_per_tech_period
  ON public.technician_payout_batches (technician_id, period_type, period_start)
  WHERE status = 'open';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.technician_payout_batches TO authenticated;
GRANT ALL ON public.technician_payout_batches TO service_role;
ALTER TABLE public.technician_payout_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Gestor full access to batches"
  ON public.technician_payout_batches FOR ALL TO authenticated
  USING (public.is_gestor(auth.uid())) WITH CHECK (public.is_gestor(auth.uid()));
CREATE POLICY "Technician reads own batches"
  ON public.technician_payout_batches FOR SELECT TO authenticated
  USING (technician_id = auth.uid());

-- 3) Batch items -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.technician_payout_batch_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.technician_payout_batches(id) ON DELETE CASCADE,
  service_request_id uuid NOT NULL UNIQUE REFERENCES public.service_requests(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_batch_items_batch ON public.technician_payout_batch_items(batch_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.technician_payout_batch_items TO authenticated;
GRANT ALL ON public.technician_payout_batch_items TO service_role;
ALTER TABLE public.technician_payout_batch_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Gestor full access to batch items"
  ON public.technician_payout_batch_items FOR ALL TO authenticated
  USING (public.is_gestor(auth.uid())) WITH CHECK (public.is_gestor(auth.uid()));
CREATE POLICY "Technician reads own batch items"
  ON public.technician_payout_batch_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.technician_payout_batches b
                 WHERE b.id = batch_id AND b.technician_id = auth.uid()));

-- 4) Link batch on accounts_payable -----------------------------------------
ALTER TABLE public.accounts_payable
  ADD COLUMN IF NOT EXISTS source_batch_id uuid REFERENCES public.technician_payout_batches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_accounts_payable_source_batch ON public.accounts_payable(source_batch_id);

-- 5) Helper: compute period range/label --------------------------------------
CREATE OR REPLACE FUNCTION public.compute_payout_period(_ref_date date, _period text)
RETURNS TABLE(period_start date, period_end date, label text)
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  s date; e date; lbl text;
  month_pt text;
  m int;
BEGIN
  IF _period = 'weekly' THEN
    s := date_trunc('week', _ref_date)::date; -- Monday
    e := s + 6;
    lbl := 'Semanal (' || to_char(s,'DD/MM/YYYY') || ' a ' || to_char(e,'DD/MM/YYYY') || ')';
  ELSIF _period = 'biweekly' THEN
    IF extract(day from _ref_date) <= 15 THEN
      s := date_trunc('month', _ref_date)::date;
      e := s + 14;
      m := extract(month from s)::int;
      month_pt := (ARRAY['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'])[m];
      lbl := 'Quinzena 1 – ' || month_pt || '/' || to_char(s,'YYYY');
    ELSE
      s := (date_trunc('month', _ref_date) + interval '15 days')::date;
      e := (date_trunc('month', _ref_date) + interval '1 month - 1 day')::date;
      m := extract(month from s)::int;
      month_pt := (ARRAY['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'])[m];
      lbl := 'Quinzena 2 – ' || month_pt || '/' || to_char(s,'YYYY');
    END IF;
  ELSE
    s := date_trunc('month', _ref_date)::date;
    e := (date_trunc('month', _ref_date) + interval '1 month - 1 day')::date;
    m := extract(month from s)::int;
    month_pt := (ARRAY['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'])[m];
    lbl := month_pt || '/' || to_char(s,'YYYY');
  END IF;
  period_start := s; period_end := e; label := lbl;
  RETURN NEXT;
END$$;

-- 6) Trigger on service_requests: add/remove from batch ----------------------
CREATE OR REPLACE FUNCTION public.handle_tech_payout_liberado()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_period text;
  v_amount numeric;
  v_tech_name text;
  v_pr record;
  v_batch_id uuid;
  v_payable_id uuid;
  v_ref_date date;
BEGIN
  -- Service becomes "liberado" (received_at newly set, not yet paid)
  IF NEW.received_at IS NOT NULL
     AND NEW.baixa_received_at IS NULL
     AND NEW.technician_id IS NOT NULL
     AND COALESCE(NEW.technician_payout,0) > 0
     AND (TG_OP = 'INSERT' OR OLD.received_at IS NULL OR OLD.received_at IS DISTINCT FROM NEW.received_at
          OR OLD.technician_id IS DISTINCT FROM NEW.technician_id
          OR OLD.technician_payout IS DISTINCT FROM NEW.technician_payout)
  THEN
    -- Skip if service already in a paid batch
    IF EXISTS (
      SELECT 1 FROM public.technician_payout_batch_items i
      JOIN public.technician_payout_batches b ON b.id = i.batch_id
      WHERE i.service_request_id = NEW.id AND b.status = 'paid'
    ) THEN
      RETURN NEW;
    END IF;

    v_amount := NEW.technician_payout;
    v_ref_date := NEW.received_at::date;

    SELECT period_type INTO v_period FROM public.technician_payout_settings LIMIT 1;
    v_period := COALESCE(v_period, 'monthly');

    SELECT * INTO v_pr FROM public.compute_payout_period(v_ref_date, v_period);
    SELECT full_name INTO v_tech_name FROM public.profiles WHERE user_id = NEW.technician_id;
    v_tech_name := COALESCE(NULLIF(v_tech_name,''), 'Técnico');

    SELECT id, payable_id INTO v_batch_id, v_payable_id
    FROM public.technician_payout_batches
    WHERE technician_id = NEW.technician_id
      AND period_type = v_period
      AND period_start = v_pr.period_start
      AND status = 'open'
    LIMIT 1;

    IF v_batch_id IS NULL THEN
      INSERT INTO public.accounts_payable (description, category, total_amount, due_date, status, notes)
      VALUES ('Pagamento Técnico ' || v_tech_name || ' — ' || v_pr.label,
              'outros', 0, v_pr.period_end, 'pendente',
              'Lote automático de pagamento ao técnico')
      RETURNING id INTO v_payable_id;

      INSERT INTO public.technician_payout_batches
        (technician_id, period_type, period_start, period_end, label, status, payable_id)
      VALUES (NEW.technician_id, v_period, v_pr.period_start, v_pr.period_end, v_pr.label, 'open', v_payable_id)
      RETURNING id INTO v_batch_id;

      UPDATE public.accounts_payable SET source_batch_id = v_batch_id WHERE id = v_payable_id;
    END IF;

    INSERT INTO public.technician_payout_batch_items (batch_id, service_request_id, amount)
    VALUES (v_batch_id, NEW.id, v_amount)
    ON CONFLICT (service_request_id) DO UPDATE
      SET amount = EXCLUDED.amount, batch_id = EXCLUDED.batch_id;

    UPDATE public.technician_payout_batches b
       SET total_amount = COALESCE((SELECT SUM(amount) FROM public.technician_payout_batch_items WHERE batch_id = b.id),0),
           updated_at = now()
     WHERE b.id = v_batch_id;
    UPDATE public.accounts_payable
       SET total_amount = COALESCE((SELECT total_amount FROM public.technician_payout_batches WHERE id = v_batch_id),0),
           updated_at = now()
     WHERE id = v_payable_id;
  END IF;

  -- Reversal: clearing received_at removes from any open batch
  IF TG_OP = 'UPDATE' AND NEW.received_at IS NULL AND OLD.received_at IS NOT NULL THEN
    DELETE FROM public.technician_payout_batch_items
     WHERE service_request_id = NEW.id
       AND batch_id IN (SELECT id FROM public.technician_payout_batches WHERE status = 'open');

    UPDATE public.technician_payout_batches b
       SET total_amount = COALESCE((SELECT SUM(amount) FROM public.technician_payout_batch_items WHERE batch_id = b.id),0),
           updated_at = now()
     WHERE b.status = 'open';

    UPDATE public.accounts_payable ap
       SET total_amount = b.total_amount, updated_at = now()
      FROM public.technician_payout_batches b
     WHERE ap.id = b.payable_id AND b.status = 'open';
  END IF;

  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS trg_tech_payout_liberado ON public.service_requests;
CREATE TRIGGER trg_tech_payout_liberado
AFTER INSERT OR UPDATE OF received_at, technician_id, technician_payout, baixa_received_at
ON public.service_requests
FOR EACH ROW EXECUTE FUNCTION public.handle_tech_payout_liberado();

-- 7) Trigger on accounts_payable: when paid -> propagate ---------------------
CREATE OR REPLACE FUNCTION public.handle_payable_paid_for_batch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_batch_id uuid;
  v_paid_at timestamptz;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = 'paga' AND (OLD.status IS DISTINCT FROM 'paga') THEN
    SELECT id INTO v_batch_id FROM public.technician_payout_batches WHERE payable_id = NEW.id;
    IF v_batch_id IS NOT NULL THEN
      v_paid_at := COALESCE(NEW.paid_at, now());
      UPDATE public.technician_payout_batches
         SET status = 'paid', paid_at = v_paid_at, payment_method = NEW.payment_method, updated_at = now()
       WHERE id = v_batch_id;
      UPDATE public.service_requests
         SET baixa_received_at = v_paid_at
       WHERE id IN (SELECT service_request_id FROM public.technician_payout_batch_items WHERE batch_id = v_batch_id)
         AND baixa_received_at IS NULL;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'paga' AND NEW.status IS DISTINCT FROM 'paga' THEN
    UPDATE public.technician_payout_batches
       SET status = 'open', paid_at = NULL, updated_at = now()
     WHERE payable_id = NEW.id;
  END IF;

  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS trg_payable_paid_for_batch ON public.accounts_payable;
CREATE TRIGGER trg_payable_paid_for_batch
AFTER UPDATE OF status, paid_at, payment_method ON public.accounts_payable
FOR EACH ROW EXECUTE FUNCTION public.handle_payable_paid_for_batch();

-- 8) Backfill existing "liberado" services ----------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT id FROM public.service_requests
    WHERE received_at IS NOT NULL
      AND baixa_received_at IS NULL
      AND technician_id IS NOT NULL
      AND COALESCE(technician_payout,0) > 0
    ORDER BY received_at
  LOOP
    UPDATE public.service_requests SET received_at = received_at WHERE id = r.id;
  END LOOP;
END$$;

CREATE TRIGGER update_tech_payout_settings_updated_at
BEFORE UPDATE ON public.technician_payout_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tech_payout_batches_updated_at
BEFORE UPDATE ON public.technician_payout_batches
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
