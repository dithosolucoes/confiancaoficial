CREATE OR REPLACE FUNCTION public.resolve_payout_amount(_ref text, _appliance text)
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ref_prefix text;
  norm_appliance text;
  co_match boolean := false;
  amt numeric;
  co_list text[] := ARRAY[
    'frigorifico','refrigerador','arca',
    'maquina de lavar roupa','lava e seca','micro-ondas','microondas',
    'placa de inducao','placa inducao','vitroceramica','placa vitroceramica',
    'forno','forno eletrico','lava-loucas','lava loucas','secadora',
    'termocumulador'
  ];
  item text;
BEGIN
  ref_prefix := upper(left(coalesce(_ref,''), 2));
  norm_appliance := lower(translate(coalesce(_appliance,''),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'));

  -- WO ou SR mantêm a sua referência
  IF ref_prefix IN ('WO','SR','CO') THEN
    SELECT amount INTO amt FROM public.technician_payout_rates WHERE reference = ref_prefix;
    RETURN amt;
  END IF;

  -- Outra referência: tentar derivar CO a partir do appliance_type
  FOREACH item IN ARRAY co_list LOOP
    IF position(item in norm_appliance) > 0 THEN
      co_match := true;
      EXIT;
    END IF;
  END LOOP;

  IF co_match THEN
    SELECT amount INTO amt FROM public.technician_payout_rates WHERE reference = 'CO';
    RETURN amt;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.lock_payout_on_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sr record;
  computed numeric;
BEGIN
  SELECT id, reference, appliance_type, technician_payout, technician_payout_locked, technician_payout_overridden
    INTO sr FROM public.service_requests WHERE id = NEW.service_request_id;

  IF sr.id IS NULL OR sr.technician_payout_locked THEN
    RETURN NEW;
  END IF;

  IF sr.technician_payout_overridden AND sr.technician_payout IS NOT NULL THEN
    UPDATE public.service_requests
      SET technician_payout_locked = true
      WHERE id = sr.id;
  ELSE
    computed := public.resolve_payout_amount(sr.reference, sr.appliance_type);
    UPDATE public.service_requests
      SET technician_payout = COALESCE(computed, sr.technician_payout, 0),
          technician_payout_locked = true
      WHERE id = sr.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_payout_on_rating ON public.service_ratings;
CREATE TRIGGER trg_lock_payout_on_rating
  AFTER INSERT ON public.service_ratings
  FOR EACH ROW EXECUTE FUNCTION public.lock_payout_on_rating();