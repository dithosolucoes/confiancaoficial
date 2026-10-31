-- Margem sobre peças (decisão do cliente, 30/10/2026).
-- A Confiança acrescenta um percentual sobre o custo da peça no valor cobrado ao cliente.
-- O percentual é configurado pelo gestor em platform_settings (chave parts_markup_pct).
-- Cada peça guarda o percentual usado no momento do lançamento (markup_pct), e
-- mudar a margem depois NÃO altera peças já lançadas.
-- O valor para o cliente (material_cost) é calculado no banco, não confiado ao app.

-- 1) Valor inicial: 15%
INSERT INTO public.platform_settings (key, value)
SELECT 'parts_markup_pct', '15'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_settings WHERE key = 'parts_markup_pct'
);

-- 2) Validação: só número entre 0 e 100
CREATE OR REPLACE FUNCTION public.validate_parts_markup_setting()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.key = 'parts_markup_pct' THEN
    IF jsonb_typeof(NEW.value) <> 'number'
       OR (NEW.value #>> '{}')::numeric < 0
       OR (NEW.value #>> '{}')::numeric > 100 THEN
      RAISE EXCEPTION 'A margem sobre peças deve ser um número entre 0 e 100.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_parts_markup_setting ON public.platform_settings;
CREATE TRIGGER trg_validate_parts_markup_setting
  BEFORE INSERT ON public.platform_settings
  FOR EACH ROW EXECUTE FUNCTION public.validate_parts_markup_setting();

-- 3) Percentual vigente (versão mais recente com vigência até a data dada)
CREATE OR REPLACE FUNCTION public.get_parts_markup_pct(_at timestamptz DEFAULT now())
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT (ps.value #>> '{}')::numeric
       FROM public.platform_settings ps
      WHERE ps.key = 'parts_markup_pct'
        AND ps.effective_from <= _at
      ORDER BY ps.effective_from DESC
      LIMIT 1),
    15
  );
$$;

-- 4) Peças guardam o percentual usado
ALTER TABLE public.service_materials
  ADD COLUMN IF NOT EXISTS markup_pct numeric(5,2);

CREATE OR REPLACE FUNCTION public.apply_parts_markup()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.markup_pct IS NULL THEN
      NEW.markup_pct := public.get_parts_markup_pct(now());
    END IF;
  ELSE
    -- o percentual gravado na peça não muda depois do lançamento
    NEW.markup_pct := COALESCE(OLD.markup_pct, NEW.markup_pct);
  END IF;

  -- valor para o cliente = custo da peça + percentual (só quando há custo informado)
  IF NEW.markup_pct IS NOT NULL AND COALESCE(NEW.supplier_cost, 0) > 0 THEN
    NEW.material_cost := round(NEW.supplier_cost * (1 + NEW.markup_pct / 100), 2);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_parts_markup ON public.service_materials;
CREATE TRIGGER trg_apply_parts_markup
  BEFORE INSERT OR UPDATE ON public.service_materials
  FOR EACH ROW EXECUTE FUNCTION public.apply_parts_markup();
