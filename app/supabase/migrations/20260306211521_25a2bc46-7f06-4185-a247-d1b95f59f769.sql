ALTER TABLE public.service_requests 
  ADD COLUMN equipment_number text DEFAULT '',
  ADD COLUMN equipment_brand text DEFAULT '',
  ADD COLUMN equipment_model text DEFAULT '',
  ADD COLUMN equipment_age text DEFAULT '';