-- A sincronização de contas pagas grava em cash_flow_entries usando source_payable_id
-- (com ON CONFLICT nesse campo). A coluna e o índice único parcial não existiam.
ALTER TABLE public.cash_flow_entries
  ADD COLUMN IF NOT EXISTS source_payable_id uuid REFERENCES public.accounts_payable(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS cash_flow_entries_source_payable_id_key
  ON public.cash_flow_entries(source_payable_id)
  WHERE source_payable_id IS NOT NULL;
