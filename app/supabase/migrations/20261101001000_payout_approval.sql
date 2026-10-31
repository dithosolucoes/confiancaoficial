-- Aprovação do gestor antes de pagar repasse acima de um valor de corte.
-- Desligada por padrão: sem a chave payout_approval_threshold em platform_settings, nada muda.

ALTER TABLE public.technician_payout_batches
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid;

CREATE OR REPLACE FUNCTION public.payout_approval_threshold()
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN jsonb_typeof(value) = 'number' THEN (value #>> '{}')::numeric END
  FROM public.platform_settings
  WHERE key = 'payout_approval_threshold'
  ORDER BY effective_from DESC
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.payout_needs_approval(_amount numeric)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.payout_approval_threshold() IS NOT NULL
     AND _amount >= public.payout_approval_threshold()
$$;

CREATE OR REPLACE FUNCTION public.block_unapproved_payout()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid'
     AND NEW.approved_at IS NULL
     AND public.payout_needs_approval(NEW.total_amount) THEN
    RAISE EXCEPTION 'Lote de repasse acima do valor de corte precisa de aprovação do gestor antes do pagamento';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_unapproved_payout ON public.technician_payout_batches;
CREATE TRIGGER trg_block_unapproved_payout
  BEFORE UPDATE ON public.technician_payout_batches
  FOR EACH ROW EXECUTE FUNCTION public.block_unapproved_payout();

CREATE OR REPLACE FUNCTION public.aprovar_lote_repasse(_batch_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_gestor(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas o gestor pode aprovar repasse';
  END IF;
  UPDATE public.technician_payout_batches
     SET approved_at = now(), approved_by = auth.uid()
   WHERE id = ANY(_batch_ids) AND status = 'open' AND approved_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.aprovar_lote_repasse(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aprovar_lote_repasse(uuid[]) TO authenticated;
REVOKE ALL ON FUNCTION public.payout_approval_threshold() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.payout_approval_threshold() TO authenticated;
