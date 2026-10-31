
-- Add warranty return fields to service_requests
ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS warranty_return_date date,
  ADD COLUMN IF NOT EXISTS warranty_return_time text,
  ADD COLUMN IF NOT EXISTS warranty_report_text text,
  ADD COLUMN IF NOT EXISTS warranty_report_url text,
  ADD COLUMN IF NOT EXISTS warranty_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS warranty_completed_at timestamptz;

-- Add flag on service_photos to distinguish photos taken during the warranty return visit
ALTER TABLE public.service_photos
  ADD COLUMN IF NOT EXISTS is_warranty_photo boolean NOT NULL DEFAULT false;

-- Migrate existing duplicates: references ending with ' - Em Garantia' are warranty returns
-- of the same parent reference. Merge their data into the parent record then soft delete them.
DO $$
DECLARE
  dup RECORD;
  parent_id uuid;
  parent_ref text;
BEGIN
  FOR dup IN
    SELECT * FROM public.service_requests
    WHERE reference LIKE '% - Em Garantia'
      AND deleted_at IS NULL
  LOOP
    parent_ref := regexp_replace(dup.reference, ' - Em Garantia$', '');
    SELECT id INTO parent_id
    FROM public.service_requests
    WHERE reference = parent_ref
      AND id <> dup.id
    ORDER BY created_at ASC
    LIMIT 1;

    IF parent_id IS NOT NULL THEN
      -- Merge warranty visit fields onto parent
      UPDATE public.service_requests
      SET
        is_warranty = true,
        warranty_return_date = COALESCE(warranty_return_date, dup.scheduled_date),
        warranty_return_time = COALESCE(warranty_return_time, dup.scheduled_time),
        warranty_report_text = COALESCE(warranty_report_text, dup.report_text),
        warranty_report_url  = COALESCE(warranty_report_url, dup.report_url),
        warranty_started_at  = COALESCE(warranty_started_at, dup.started_at),
        warranty_completed_at = COALESCE(warranty_completed_at, dup.completed_at),
        status = CASE WHEN dup.status IS NOT NULL THEN dup.status ELSE status END,
        updated_at = now()
      WHERE id = parent_id;

      -- Re-link warranty visit photos to parent and tag them
      UPDATE public.service_photos
      SET service_request_id = parent_id, is_warranty_photo = true
      WHERE service_request_id = dup.id;

      -- Re-link materials and notifications to parent so nothing is orphaned
      UPDATE public.service_materials SET service_request_id = parent_id WHERE service_request_id = dup.id;
      UPDATE public.technician_notifications SET service_request_id = parent_id WHERE service_request_id = dup.id;

      -- Soft delete the duplicate
      UPDATE public.service_requests
      SET deleted_at = now(), updated_at = now()
      WHERE id = dup.id;
    END IF;
  END LOOP;
END $$;
