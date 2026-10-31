CREATE OR REPLACE FUNCTION public.log_service_schedule_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_return_number integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.parent_service_id IS NOT NULL AND COALESCE(NEW.is_warranty, false) THEN
      SELECT COALESCE(max(sequence), 0) + 1
        INTO next_return_number
      FROM public.service_return_visits rv
      WHERE rv.service_request_id = NEW.parent_service_id;

      INSERT INTO public.service_schedule_events (
        service_request_id, event_type, event_date, event_time, technician_id, status, title, description, metadata, created_by
      ) VALUES (
        NEW.parent_service_id,
        'return_scheduled',
        NEW.scheduled_date,
        NEW.scheduled_time,
        NEW.technician_id,
        NEW.status,
        next_return_number::text || '.º Retorno',
        COALESCE(NEW.warranty_return_description, NEW.description),
        jsonb_build_object('child_service_id', NEW.id, 'child_reference', NEW.reference),
        auth.uid()
      );
    ELSE
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
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date
     OR NEW.scheduled_time IS DISTINCT FROM OLD.scheduled_time THEN
    INSERT INTO public.service_schedule_events (
      service_request_id, event_type, event_date, event_time, technician_id, status, title, description, metadata, created_by
    ) VALUES (
      COALESCE(NEW.parent_service_id, NEW.id),
      'reschedule',
      NEW.scheduled_date,
      NEW.scheduled_time,
      NEW.technician_id,
      NEW.status,
      CASE WHEN NEW.parent_service_id IS NOT NULL THEN 'Reagendamento de Retorno' ELSE 'Reagendamento' END,
      'Data/hora reagendada.',
      jsonb_build_object(
        'service_request_id', NEW.id,
        'previous_date', OLD.scheduled_date,
        'previous_time', OLD.scheduled_time,
        'new_date', NEW.scheduled_date,
        'new_time', NEW.scheduled_time
      ),
      auth.uid()
    );
  END IF;

  IF NEW.warranty_return_date IS DISTINCT FROM OLD.warranty_return_date
     OR NEW.warranty_return_time IS DISTINCT FROM OLD.warranty_return_time THEN
    IF NEW.warranty_return_date IS NOT NULL THEN
      SELECT COALESCE(max(sequence), 0) + 1
        INTO next_return_number
      FROM public.service_return_visits rv
      WHERE rv.service_request_id = NEW.id;

      INSERT INTO public.service_schedule_events (
        service_request_id, event_type, event_date, event_time, technician_id, status, title, description, metadata, created_by
      ) VALUES (
        NEW.id,
        CASE WHEN OLD.warranty_return_date IS NULL THEN 'return_scheduled' ELSE 'return_rescheduled' END,
        NEW.warranty_return_date,
        NEW.warranty_return_time,
        NEW.technician_id,
        NEW.status,
        CASE WHEN OLD.warranty_return_date IS NULL THEN next_return_number::text || '.º Retorno' ELSE 'Reagendamento de Retorno' END,
        NEW.warranty_return_description,
        jsonb_build_object(
          'previous_date', OLD.warranty_return_date,
          'previous_time', OLD.warranty_return_time,
          'new_date', NEW.warranty_return_date,
          'new_time', NEW.warranty_return_time,
          'original_scheduled_date', NEW.original_scheduled_date,
          'original_scheduled_time', NEW.original_scheduled_time
        ),
        auth.uid()
      );
    END IF;
  END IF;

  IF NEW.completed_at IS DISTINCT FROM OLD.completed_at AND NEW.completed_at IS NOT NULL THEN
    INSERT INTO public.service_schedule_events (
      service_request_id, event_type, event_date, event_time, technician_id, status, title, description, created_by
    ) VALUES (
      COALESCE(NEW.parent_service_id, NEW.id),
      CASE WHEN NEW.parent_service_id IS NOT NULL THEN 'return_completed' ELSE 'service_completed' END,
      NEW.completed_at::date,
      to_char(NEW.completed_at, 'HH24:MI'),
      NEW.technician_id,
      NEW.status,
      CASE WHEN NEW.parent_service_id IS NOT NULL THEN 'Conclusão do Retorno' ELSE 'Conclusão do Serviço' END,
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

INSERT INTO public.service_schedule_events (
  service_request_id, event_type, event_date, event_time, technician_id, status, title, description, metadata, created_at, updated_at
)
SELECT
  child.parent_service_id,
  'return_scheduled',
  child.scheduled_date,
  child.scheduled_time,
  child.technician_id,
  child.status,
  'Retorno',
  COALESCE(child.warranty_return_description, child.description),
  jsonb_build_object('child_service_id', child.id, 'child_reference', child.reference),
  child.created_at,
  child.updated_at
FROM public.service_requests child
WHERE child.parent_service_id IS NOT NULL
  AND COALESCE(child.is_warranty, false)
  AND NOT EXISTS (
    SELECT 1 FROM public.service_schedule_events e
    WHERE e.service_request_id = child.parent_service_id
      AND e.event_type = 'return_scheduled'
      AND e.metadata->>'child_service_id' = child.id::text
  );