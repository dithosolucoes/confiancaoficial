
-- Enum for category
CREATE TYPE public.payable_category AS ENUM (
  'salarios','seguranca_social','combustivel','telecomunicacoes','internet',
  'contabilidade','fornecedores','veiculos','seguros','impostos','marketing','software','outros'
);

CREATE TYPE public.payable_status AS ENUM (
  'pendente','pago','parcialmente_pago','atrasado','cancelado'
);

CREATE TYPE public.payable_frequency AS ENUM (
  'semanal','mensal','trimestral','semestral','anual'
);

CREATE TABLE public.accounts_payable (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  description text NOT NULL,
  category public.payable_category NOT NULL DEFAULT 'outros',
  supplier_name text,
  supplier_iban text,
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  paid_amount numeric(12,2) NOT NULL DEFAULT 0,
  due_date date NOT NULL,
  paid_at timestamptz,
  status public.payable_status NOT NULL DEFAULT 'pendente',
  is_recurring boolean NOT NULL DEFAULT false,
  recurrence_frequency public.payable_frequency,
  next_due_date date,
  is_installment boolean NOT NULL DEFAULT false,
  installments_total integer,
  installment_current integer,
  parent_id uuid REFERENCES public.accounts_payable(id) ON DELETE CASCADE,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_accounts_payable_due_date ON public.accounts_payable(due_date);
CREATE INDEX idx_accounts_payable_status ON public.accounts_payable(status);
CREATE INDEX idx_accounts_payable_parent ON public.accounts_payable(parent_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts_payable TO authenticated;
GRANT ALL ON public.accounts_payable TO service_role;

ALTER TABLE public.accounts_payable ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestor can view all payables"
  ON public.accounts_payable FOR SELECT TO authenticated
  USING (public.is_gestor(auth.uid()));

CREATE POLICY "Gestor can insert payables"
  ON public.accounts_payable FOR INSERT TO authenticated
  WITH CHECK (public.is_gestor(auth.uid()));

CREATE POLICY "Gestor can update payables"
  ON public.accounts_payable FOR UPDATE TO authenticated
  USING (public.is_gestor(auth.uid()))
  WITH CHECK (public.is_gestor(auth.uid()));

CREATE POLICY "Gestor can delete payables"
  ON public.accounts_payable FOR DELETE TO authenticated
  USING (public.is_gestor(auth.uid()));

CREATE TRIGGER trg_accounts_payable_updated_at
  BEFORE UPDATE ON public.accounts_payable
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
