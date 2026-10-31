-- Progresso das etapas: índices (0,1,2...) das etapas já concluídas pelo técnico.
ALTER TABLE public.service_requests ADD COLUMN IF NOT EXISTS service_steps_done jsonb NOT NULL DEFAULT '[]'::jsonb;

-- O técnico não pode alterar o catálogo copiado para o chamado (tipo, valor e etapas).
-- Só o gestor altera esses campos depois que o chamado foi criado.
CREATE OR REPLACE FUNCTION public.guard_service_steps_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_gestor(auth.uid()) THEN
    RETURN NEW;
  END IF;
  NEW.service_type_id       := OLD.service_type_id;
  NEW.service_type_base_fee := OLD.service_type_base_fee;
  NEW.service_steps         := OLD.service_steps;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_service_steps_snapshot ON public.service_requests;
CREATE TRIGGER trg_guard_service_steps_snapshot
  BEFORE UPDATE ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_service_steps_snapshot();
