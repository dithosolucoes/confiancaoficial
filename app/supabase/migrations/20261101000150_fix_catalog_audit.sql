-- Correção: a função de auditoria do catálogo (20261028020000) lia a coluna base_fee
-- em TODAS as tabelas com gatilho. Só service_types tem base_fee; appliance_types
-- não tem. Resultado: qualquer UPDATE em appliance_types falhava com
-- "column base_fee not found". Aqui a leitura passa a ser por jsonb: coluna que a
-- tabela não tem vira NULL (sem erro) e não gera registro de auditoria.

CREATE OR REPLACE FUNCTION public.log_catalog_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  col TEXT;
  old_j JSONB := to_jsonb(OLD);
  new_j JSONB := to_jsonb(NEW);
  old_val TEXT;
  new_val TEXT;
BEGIN
  FOREACH col IN ARRAY ARRAY['active', 'vat_rate', 'base_fee', 'sort_order', 'name']
  LOOP
    old_val := old_j ->> col;
    new_val := new_j ->> col;
    IF old_val IS DISTINCT FROM new_val THEN
      INSERT INTO public.settings_audit (table_name, record_id, field, old_value, new_value, changed_by)
      VALUES (TG_TABLE_NAME, NEW.id, col, old_val, new_val, auth.uid());
    END IF;
  END LOOP;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.log_catalog_change() FROM PUBLIC, anon, authenticated;
