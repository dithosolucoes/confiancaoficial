-- Função utilitária para recalcular o pagamento de TODOS os serviços
-- respeitando overrides manuais (technician_payout_overridden) e bloqueios (technician_payout_locked).
CREATE OR REPLACE FUNCTION public.recalculate_all_technician_payouts()
RETURNS TABLE(updated_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  computed numeric;
  cnt integer := 0;
BEGIN
  FOR r IN
    SELECT id, technician_payout
      FROM public.service_requests
     WHERE coalesce(technician_payout_locked, false) = false
       AND coalesce(technician_payout_overridden, false) = false
  LOOP
    computed := public.resolve_service_payout_amount(r.id);
    IF computed IS NOT NULL AND computed IS DISTINCT FROM r.technician_payout THEN
      UPDATE public.service_requests
         SET technician_payout = computed
       WHERE id = r.id;
      cnt := cnt + 1;
    END IF;
  END LOOP;
  updated_count := cnt;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.recalculate_all_technician_payouts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_all_technician_payouts() TO service_role;

-- Execução imediata para normalizar todos os serviços já existentes
SELECT public.recalculate_all_technician_payouts();