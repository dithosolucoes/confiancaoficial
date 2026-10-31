-- Configurações do gestor: base do catálogo (seção 9.1 do blueprint).
--
-- Primeira fatia: catálogo de tipos de aparelho/serviço e parâmetros simples,
-- hoje fixos no código (APPLIANCE_TYPES em ServiceRequestForm.tsx, e a lista
-- de IVA duplicada em src/lib/vat.ts e em create-payment).
--
-- Este migration é só schema + semente: NADA no app lê daqui ainda. O rewire
-- do ServiceRequestForm e do create-payment para usar esta tabela, em vez das
-- listas fixas, é um passo à parte (risco de regressão na cobrança: precisa
-- de teste dedicado antes de trocar).
--
-- As regras de repasse configurável (payout_rules, por empresa/tipo de
-- serviço/vigência) também ficam para uma migration própria: mexem na
-- função resolve_service_payout_amount, que é crítica e já testada.

-- 1) Catálogo de tipos de aparelho/serviço (o que hoje é APPLIANCE_TYPES).
--    Sem "categoria de referência" aqui: WO/SR/CO é uma propriedade do
--    PEDIDO (de onde ele veio — cliente no site = CO, digitado pelo gestor
--    = WO/SR), não do tipo de aparelho. Ver blueprint, seção 18.
CREATE TABLE IF NOT EXISTS public.appliance_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  vat_rate NUMERIC NOT NULL DEFAULT 23 CHECK (vat_rate IN (6, 23)),
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appliance_types_active ON public.appliance_types(active);

-- 2) Tipos de serviço (instalação, reparação, manutenção, garantia — hoje
--    não existe catálogo nenhum para isso).
CREATE TABLE IF NOT EXISTS public.service_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  base_fee NUMERIC NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_types_active ON public.service_types(active);

-- 3) Parâmetros simples da plataforma (um valor por chave, com vigência).
--    Ex.: prazo de validade do orçamento, antecedência mínima de agendamento.
--    Km (mileage_settings) e fluxo de caixa (cash_flow_settings) já têm
--    tabela própria; platform_settings é para o que ainda não tem.
CREATE TABLE IF NOT EXISTS public.platform_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_settings_key ON public.platform_settings(key, effective_from DESC);

-- 4) Histórico de alterações do catálogo (quem, quando, de/para).
CREATE TABLE IF NOT EXISTS public.settings_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID,
  field TEXT,
  old_value TEXT,
  new_value TEXT,
  changed_by UUID REFERENCES auth.users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_settings_audit_table ON public.settings_audit(table_name, changed_at DESC);

-- 5) RLS: só o gestor grava; qualquer autenticado lê (o formulário de pedido
--    e as telas de orçamento precisam ler o catálogo ativo).
ALTER TABLE public.appliance_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Gestores have full access to appliance_types" ON public.appliance_types;
CREATE POLICY "Gestores have full access to appliance_types"
  ON public.appliance_types FOR ALL TO authenticated
  USING (public.is_gestor(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can read appliance_types" ON public.appliance_types;
CREATE POLICY "Authenticated users can read appliance_types"
  ON public.appliance_types FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Gestores have full access to service_types" ON public.service_types;
CREATE POLICY "Gestores have full access to service_types"
  ON public.service_types FOR ALL TO authenticated
  USING (public.is_gestor(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can read service_types" ON public.service_types;
CREATE POLICY "Authenticated users can read service_types"
  ON public.service_types FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Gestores have full access to platform_settings" ON public.platform_settings;
CREATE POLICY "Gestores have full access to platform_settings"
  ON public.platform_settings FOR ALL TO authenticated
  USING (public.is_gestor(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can read platform_settings" ON public.platform_settings;
CREATE POLICY "Authenticated users can read platform_settings"
  ON public.platform_settings FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Gestores can read settings_audit" ON public.settings_audit;
CREATE POLICY "Gestores can read settings_audit"
  ON public.settings_audit FOR SELECT TO authenticated
  USING (public.is_gestor(auth.uid()));

-- settings_audit só é escrita pela função SECURITY DEFINER abaixo; ninguém
-- grava direto na tabela (nem o gestor), para o log não poder ser forjado.

-- 6) Gatilho de auditoria para appliance_types e service_types: registra
--    cada mudança de active/vat_rate/base_fee/sort_order/name, com o valor
--    antigo e o novo.
CREATE OR REPLACE FUNCTION public.log_catalog_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  col TEXT;
  old_val TEXT;
  new_val TEXT;
BEGIN
  FOREACH col IN ARRAY ARRAY['active', 'vat_rate', 'base_fee', 'sort_order', 'name']
  LOOP
    EXECUTE format('SELECT ($1).%I::text', col) USING OLD INTO old_val;
    EXECUTE format('SELECT ($1).%I::text', col) USING NEW INTO new_val;
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

DROP TRIGGER IF EXISTS log_appliance_types_change ON public.appliance_types;
CREATE TRIGGER log_appliance_types_change
  BEFORE UPDATE ON public.appliance_types
  FOR EACH ROW
  EXECUTE FUNCTION public.log_catalog_change();

DROP TRIGGER IF EXISTS log_service_types_change ON public.service_types;
CREATE TRIGGER log_service_types_change
  BEFORE UPDATE ON public.service_types
  FOR EACH ROW
  EXECUTE FUNCTION public.log_catalog_change();

-- 7) Semente: os 23 tipos hoje fixos em APPLIANCE_TYPES
--    (src/components/ServiceRequestForm.tsx), com o IVA que cada um
--    efetivamente recebe hoje pela lógica de src/lib/vat.ts (match exato,
--    por segmento ou por substring, sem acentos). Isto só documenta o
--    estado atual — nada no app lê esta tabela ainda.
--
--    Achado no caminho: "Termocumulador instalação ( até 100 Lt )" tem
--    espaços a mais ao redor dos parênteses, que quebram o match com a
--    string de vat.ts ("(até 100 Lt)", sem espaço). Hoje esse item cai no
--    IVA padrão de 23%, não nos 6% que os outros itens do mesmo aparelho
--    recebem. Preservado como está (23%) para não mudar comportamento sem
--    decisão; quando o catálogo for ligado ao app, essa inconsistência some
--    sozinha, porque o IVA passa a vir direto da coluna, não de texto.
INSERT INTO public.appliance_types (name, vat_rate, sort_order) VALUES
  ('Frigorífico / Refrigerador / Arca', 6, 1),
  ('Máquina de Lavar Roupa', 6, 2),
  ('Lava e Seca', 6, 3),
  ('Micro-ondas', 6, 4),
  ('Placa  Indução / Vitrocerâmica', 6, 5),
  ('Forno', 6, 6),
  ('Lava-louças', 6, 7),
  ('Secadora', 6, 8),
  ('Forno Elétrico', 6, 9),
  ('Termocumulador reparação', 6, 10),
  ('Termocumulador instalação ( até 100 Lt )', 23, 11),
  ('Esquentador reparação', 6, 12),
  ('Esquentador instalação', 6, 13),
  ('Vistoria técnica / Seguradora', 23, 14),
  ('Instalação de torneira', 23, 15),
  ('Troca de torneira de Segurança', 23, 16),
  ('Substituição de Bichas da pia', 23, 17),
  ('Instalação de suporte de TV', 23, 18),
  ('Pendurar quadro', 23, 19),
  ('Reparação de quadro elétrico', 23, 20),
  ('Análise de curto circuito (Moradia)', 23, 21),
  ('Substituição de Disjuntor', 23, 22),
  ('Outro', 23, 23)
ON CONFLICT (name) DO NOTHING;
