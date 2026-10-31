
-- Cash flow settings (singleton-ish per gestor; we allow one global row)
CREATE TABLE public.cash_flow_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  initial_balance numeric NOT NULL DEFAULT 0,
  initial_balance_date date NOT NULL DEFAULT CURRENT_DATE,
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_flow_settings TO authenticated;
GRANT ALL ON public.cash_flow_settings TO service_role;
ALTER TABLE public.cash_flow_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Gestor manage cash_flow_settings" ON public.cash_flow_settings
  FOR ALL TO authenticated
  USING (public.is_gestor(auth.uid()))
  WITH CHECK (public.is_gestor(auth.uid()));
CREATE TRIGGER trg_cash_flow_settings_updated_at
  BEFORE UPDATE ON public.cash_flow_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Manual cash flow entries (inflows/outflows). Auto-entries from services are derived in the UI.
CREATE TABLE public.cash_flow_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  kind text NOT NULL CHECK (kind IN ('in','out')),
  description text NOT NULL,
  origin text,            -- for inflows: worten, fixo, particular, servicos, outros
  category text,          -- for outflows: tecnicos, combustivel, ferramentas, materiais, fornecedores, renda, telecomunicacoes, marketing, impostos, outros
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  payment_method text,    -- transferencia, multibanco, mbway, dinheiro, cartao, outro
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('recebido','pago','pendente')),
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_flow_entries TO authenticated;
GRANT ALL ON public.cash_flow_entries TO service_role;
ALTER TABLE public.cash_flow_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Gestor manage cash_flow_entries" ON public.cash_flow_entries
  FOR ALL TO authenticated
  USING (public.is_gestor(auth.uid()))
  WITH CHECK (public.is_gestor(auth.uid()));
CREATE TRIGGER trg_cash_flow_entries_updated_at
  BEFORE UPDATE ON public.cash_flow_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_cash_flow_entries_date ON public.cash_flow_entries(entry_date DESC);
CREATE INDEX idx_cash_flow_entries_kind_status ON public.cash_flow_entries(kind, status);
