CREATE OR REPLACE FUNCTION public.resolve_service_payout_amount(_service_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  sr record;
  service_fee numeric := 0;
  labor_amount numeric := 0;
  extra_amount numeric := 0;
BEGIN
  SELECT id, reference, appliance_type, is_warranty, labor_cost, labor_rejected_at,
         labor_approved_at, labor_paid_at, extra_fee, deslocacao_fee, quote_status
    INTO sr
  FROM public.service_requests
  WHERE id = _service_id;

  IF sr.id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Taxa de Serviço efetivamente cobrada ao cliente (fallback pelo tipo de serviço)
  service_fee := COALESCE(
    NULLIF(sr.deslocacao_fee, 0),
    CASE
      WHEN sr.appliance_type IN ('Esquentador reparação', 'Vistoria técnica / Seguradora') THEN 85
      WHEN sr.appliance_type = 'Esquentador instalação' THEN 75
      ELSE 55
    END
  );

  -- Orçamento recusado: apenas 50% da Taxa de Serviço
  IF sr.quote_status = 'rejected' THEN
    RETURN round((service_fee * 0.5)::numeric, 2);
  END IF;

  labor_amount := CASE
    WHEN sr.labor_rejected_at IS NOT NULL AND sr.labor_approved_at IS NULL AND sr.labor_paid_at IS NULL THEN 0
    ELSE COALESCE(sr.labor_cost, 0)
  END;

  extra_amount := CASE
    WHEN COALESCE(sr.is_warranty, false) THEN 0
    ELSE COALESCE(sr.extra_fee, 0)
  END;

  RETURN round((
    (service_fee * 0.5)
    + (labor_amount * 0.5)
    + (extra_amount * 0.5)
  )::numeric, 2);
END;
$function$;