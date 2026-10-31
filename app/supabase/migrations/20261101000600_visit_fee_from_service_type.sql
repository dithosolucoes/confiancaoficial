-- Taxa de visita = taxa base do tipo de serviço (decisão de 30/10/2026).
-- Quando o chamado tem tipo de serviço com taxa base e o gestor não informou a
-- deslocação (deslocacao_fee vazio), a visita passa a valer a taxa base do tipo.
-- Chamados com deslocação informada pelo gestor não mudam. Chamados antigos não mudam.
-- Como o repasse e o extrato já leem deslocacao_fee, eles acompanham sem outra mudança.

CREATE OR REPLACE FUNCTION public.set_visit_fee_from_service_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.deslocacao_fee IS NULL AND COALESCE(NEW.service_type_base_fee, 0) > 0 THEN
    NEW.deslocacao_fee := NEW.service_type_base_fee;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_visit_fee_from_service_type ON public.service_requests;
CREATE TRIGGER trg_set_visit_fee_from_service_type
  BEFORE INSERT ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_visit_fee_from_service_type();
