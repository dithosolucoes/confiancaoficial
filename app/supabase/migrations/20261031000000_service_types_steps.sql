-- Tipos de serviço passam a definir etapas e a guardar o tipo escolhido no chamado.
ALTER TABLE public.service_types ADD COLUMN IF NOT EXISTS steps jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Snapshot no chamado: o valor e as etapas ficam congelados no momento da abertura,
-- para que mudanças futuras no catálogo não alterem chamados já criados.
ALTER TABLE public.service_requests ADD COLUMN IF NOT EXISTS service_type_id uuid REFERENCES public.service_types(id) ON DELETE SET NULL;
ALTER TABLE public.service_requests ADD COLUMN IF NOT EXISTS service_type_base_fee numeric;
ALTER TABLE public.service_requests ADD COLUMN IF NOT EXISTS service_steps jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE INDEX IF NOT EXISTS idx_service_requests_service_type ON public.service_requests(service_type_id);
