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