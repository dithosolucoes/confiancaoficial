
-- Add quantity and notes columns to service_materials
ALTER TABLE public.service_materials 
  ADD COLUMN IF NOT EXISTS quantity numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS notes text;

-- History table for gestor changes
CREATE TABLE IF NOT EXISTS public.service_materials_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES public.service_materials(id) ON DELETE CASCADE,
  service_request_id uuid NOT NULL,
  changed_by uuid NOT NULL,
  changed_by_role text NOT NULL DEFAULT 'gestor',
  previous_status text,
  new_status text,
  previous_value jsonb,
  new_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.service_materials_history TO authenticated;
GRANT ALL ON public.service_materials_history TO service_role;

ALTER TABLE public.service_materials_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestor can view history"
  ON public.service_materials_history
  FOR SELECT
  USING (public.is_gestor(auth.uid()));

CREATE POLICY "Gestor can insert history"
  ON public.service_materials_history
  FOR INSERT
  WITH CHECK (public.is_gestor(auth.uid()) AND changed_by = auth.uid());
