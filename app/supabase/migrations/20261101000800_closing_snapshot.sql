-- Foto fechada dos valores na conclusão do serviço.
-- Quando o serviço vira 'completed', grava uma vez: visita, mão de obra, taxa extra,
-- peças (valor para o cliente e custo), repasse ao técnico e a regra financeira usada.
-- Depois de gravada, a foto não muda (mesmo que o catálogo ou a margem mudem depois).

ALTER TABLE public.service_requests ADD COLUMN IF NOT EXISTS closing_snapshot JSONB;

CREATE OR REPLACE FUNCTION public.set_closing_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pecas_cliente NUMERIC;
  v_pecas_custo NUMERIC;
BEGIN
  IF NEW.status = 'completed'
     AND OLD.status IS DISTINCT FROM 'completed'
     AND NEW.closing_snapshot IS NULL THEN
    SELECT COALESCE(SUM(m.material_cost * COALESCE(m.quantity, 1)), 0),
           COALESCE(SUM(COALESCE(m.supplier_cost, 0) * COALESCE(m.quantity, 1)), 0)
      INTO v_pecas_cliente, v_pecas_custo
      FROM public.service_materials m
     WHERE m.service_request_id = NEW.id AND m.status = 'approved';

    NEW.closing_snapshot := jsonb_build_object(
      'fechado_em', now(),
      'visita', COALESCE(NEW.deslocacao_fee, 0),
      'mao_de_obra', COALESCE(NEW.labor_cost, 0),
      'taxa_extra', COALESCE(NEW.extra_fee, 0),
      'pecas_cliente', v_pecas_cliente,
      'pecas_custo', v_pecas_custo,
      'margem_pecas', v_pecas_cliente - v_pecas_custo,
      'repasse_tecnico', public.resolve_service_payout_amount(NEW.id),
      'regra_financeira', NEW.financial_rule_snapshot
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_closing_snapshot ON public.service_requests;
CREATE TRIGGER trg_set_closing_snapshot
  BEFORE UPDATE OF status ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_closing_snapshot();
