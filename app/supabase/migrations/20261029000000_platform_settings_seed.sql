-- Antecedência mínima (em horas) para cancelar ou reagendar um serviço.
-- Valor atual da regra no código: 24h. Gravado como versão inicial em platform_settings.
INSERT INTO public.platform_settings (key, value)
SELECT 'min_hours_before_service_change', '24'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_settings WHERE key = 'min_hours_before_service_change'
);
