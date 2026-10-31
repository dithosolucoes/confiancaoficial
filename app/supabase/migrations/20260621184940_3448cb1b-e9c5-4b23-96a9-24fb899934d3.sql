CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  iban text,
  contact text,
  contact_name text,
  nif text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestor can view suppliers" ON public.suppliers FOR SELECT TO authenticated USING (public.is_gestor(auth.uid()));
CREATE POLICY "Gestor can insert suppliers" ON public.suppliers FOR INSERT TO authenticated WITH CHECK (public.is_gestor(auth.uid()));
CREATE POLICY "Gestor can update suppliers" ON public.suppliers FOR UPDATE TO authenticated USING (public.is_gestor(auth.uid())) WITH CHECK (public.is_gestor(auth.uid()));
CREATE POLICY "Gestor can delete suppliers" ON public.suppliers FOR DELETE TO authenticated USING (public.is_gestor(auth.uid()));

CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.accounts_payable ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL;