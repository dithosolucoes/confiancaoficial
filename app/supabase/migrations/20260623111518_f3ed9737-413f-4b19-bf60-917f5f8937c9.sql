ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS original_scheduled_date date,
  ADD COLUMN IF NOT EXISTS original_scheduled_time text;

UPDATE public.service_requests
SET original_scheduled_date = COALESCE(original_scheduled_date, scheduled_date),
    original_scheduled_time = COALESCE(original_scheduled_time, scheduled_time)
WHERE original_scheduled_date IS NULL OR original_scheduled_time IS NULL;

CREATE TABLE public.service_schedule_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id uuid NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_date date,
  event_time text,
  technician_id uuid,
  status text,
  title text NOT NULL,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_service_schedule_events_service ON public.service_schedule_events(service_request_id, created_at);
CREATE INDEX idx_service_schedule_events_type ON public.service_schedule_events(event_type);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_schedule_events TO authenticated;
GRANT ALL ON public.service_schedule_events TO service_role;

ALTER TABLE public.service_schedule_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestor manage schedule events"
  ON public.service_schedule_events FOR ALL
  USING (public.is_gestor(auth.uid()))
  WITH CHECK (public.is_gestor(auth.uid()));

CREATE POLICY "View schedule events for accessible services"
  ON public.service_schedule_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.service_requests sr
      WHERE sr.id = service_schedule_events.service_request_id
        AND (
          public.is_gestor(auth.uid())
          OR sr.customer_id = auth.uid()
          OR sr.technician_id = auth.uid()
          OR sr.customer_id IN (SELECT public.get_partner_user_ids(auth.uid()))
        )
    )
  );

CREATE TRIGGER trg_service_schedule_events_updated_at
  BEFORE UPDATE ON public.service_schedule_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.preserve_original_schedule_on_service_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.original_scheduled_date := COALESCE(NEW.original_scheduled_date, NEW.scheduled_date);
    NEW.original_scheduled_time := COALESCE(NEW.original_scheduled_time, NEW.scheduled_time);
    RETURN NEW;
  END IF;

  NEW.original_scheduled_date := COALESCE(OLD.original_scheduled_date, OLD.scheduled_date, NEW.scheduled_date);
  NEW.original_scheduled_time := COALESCE(OLD.original_scheduled_time, OLD.scheduled_time, NEW.scheduled_time);

  IF (NEW.warranty_return_date IS DISTINCT FROM OLD.warranty_return_date
      OR NEW.warranty_return_time IS DISTINCT FROM OLD.warranty_return_time)
     AND (NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date
          OR NEW.scheduled_time IS DISTINCT FROM OLD.scheduled_time) THEN
    NEW.scheduled_date := OLD.scheduled_date;
    NEW.scheduled_time := OLD.scheduled_time;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_preserve_original_schedule_on_service_request ON public.service_requests;
CREATE TRIGGER trg_preserve_original_schedule_on_service_request
  BEFORE INSERT OR UPDATE ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION public.preserve_original_schedule_on_service_request();

CREATE OR REPLACE FUNCTION public.log_service_schedule_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.service_schedule_events (
      service_request_id, event_type, event_date, event_time, technician_id, status, title, description, created_by
    ) VALUES (
      NEW.id,
      'initial_schedule',
      NEW.original_scheduled_date,
      NEW.original_scheduled_time,
      NEW.technician_id,
      NEW.status,
      'Agendamento Inicial',
      NEW.description,
      auth.uid()
    );
    RETURN NEW;
  END IF;

  IF NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date
     OR NEW.scheduled_time IS DISTINCT FROM OLD.scheduled_time THEN
    INSERT INTO public.service_schedule_events (
      service_request_id, event_type, event_date, event_time, technician_id, status, title, description, metadata, created_by
    ) VALUES (
      NEW.id,
      'reschedule',
      NEW.scheduled_date,
      NEW.scheduled_time,
      NEW.technician_id,
      NEW.status,
      'Reagendamento',
      'Data/hora do serviço reagendada.',
      jsonb_build_object(
        'previous_date', OLD.scheduled_date,
        'previous_time', OLD.scheduled_time,
        'new_date', NEW.scheduled_date,
        'new_time', NEW.scheduled_time
      ),
      auth.uid()
    );
  END IF;

  IF NEW.completed_at IS DISTINCT FROM OLD.completed_at AND NEW.completed_at IS NOT NULL THEN
    INSERT INTO public.service_schedule_events (
      service_request_id, event_type, event_date, event_time, technician_id, status, title, description, created_by
    ) VALUES (
      NEW.id,
      'service_completed',
      NEW.completed_at::date,
      to_char(NEW.completed_at, 'HH24:MI'),
      NEW.technician_id,
      NEW.status,
      'Conclusão do Serviço',
      NEW.report_text,
      auth.uid()
    );
  END IF;

  IF NEW.warranty_completed_at IS DISTINCT FROM OLD.warranty_completed_at AND NEW.warranty_completed_at IS NOT NULL THEN
    INSERT INTO public.service_schedule_events (
      service_request_id, event_type, event_date, event_time, technician_id, status, title, description, created_by
    ) VALUES (
      NEW.id,
      'return_completed',
      NEW.warranty_completed_at::date,
      to_char(NEW.warranty_completed_at, 'HH24:MI'),
      NEW.technician_id,
      NEW.status,
      'Conclusão do Retorno',
      NEW.warranty_report_text,
      auth.uid()
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_service_schedule_event ON public.service_requests;
CREATE TRIGGER trg_log_service_schedule_event
  AFTER INSERT OR UPDATE ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION public.log_service_schedule_event();

INSERT INTO public.service_schedule_events (
  service_request_id, event_type, event_date, event_time, technician_id, status, title, description, created_at, updated_at
)
SELECT sr.id, 'initial_schedule', sr.original_scheduled_date, sr.original_scheduled_time, sr.technician_id, sr.status, 'Agendamento Inicial', sr.description, sr.created_at, sr.created_at
FROM public.service_requests sr
WHERE NOT EXISTS (
  SELECT 1 FROM public.service_schedule_events e
  WHERE e.service_request_id = sr.id AND e.event_type = 'initial_schedule'
);

INSERT INTO public.service_schedule_events (
  service_request_id, event_type, event_date, event_time, technician_id, status, title, description, created_at, updated_at
)
SELECT sr.id, 'return_scheduled', sr.warranty_return_date, sr.warranty_return_time, sr.technician_id, sr.status, 'Retorno registado', sr.warranty_return_description, COALESCE(sr.warranty_return_requested_at, sr.updated_at, now()), COALESCE(sr.updated_at, now())
FROM public.service_requests sr
WHERE sr.warranty_return_date IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.service_schedule_events e
    WHERE e.service_request_id = sr.id
      AND e.event_type IN ('return_scheduled', 'return_rescheduled')
      AND e.event_date = sr.warranty_return_date
      AND COALESCE(e.event_time, '') = COALESCE(sr.warranty_return_time, '')
  );

INSERT INTO public.service_schedule_events (
  service_request_id, event_type, event_date, event_time, technician_id, status, title, description, created_at, updated_at
)
SELECT sr.id, 'service_completed', sr.completed_at::date, to_char(sr.completed_at, 'HH24:MI'), sr.technician_id, sr.status, 'Conclusão do Serviço', sr.report_text, sr.completed_at, sr.completed_at
FROM public.service_requests sr
WHERE sr.completed_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.service_schedule_events e
    WHERE e.service_request_id = sr.id AND e.event_type = 'service_completed'
  );