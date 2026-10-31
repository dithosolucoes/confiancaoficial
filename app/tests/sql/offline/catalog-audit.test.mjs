// Auditoria do catálogo + avisos de aparelho (migrações 20261101000150 e 20261101000200).
// Regressão: antes, qualquer UPDATE em appliance_types falhava ("column base_fee not found").
import { PGlite } from "@electric-sql/pglite";
import { readMigration, makeCheck } from "./_db.mjs";

const db = new PGlite();
const { check, failures } = makeCheck();
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
CREATE TABLE public.appliance_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL UNIQUE,
  vat_rate NUMERIC NOT NULL DEFAULT 23, active BOOLEAN NOT NULL DEFAULT true, sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE public.service_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL UNIQUE, description TEXT,
  base_fee NUMERIC NOT NULL DEFAULT 0, active BOOLEAN NOT NULL DEFAULT true, sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE public.settings_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), table_name TEXT NOT NULL, record_id UUID, field TEXT,
  old_value TEXT, new_value TEXT, changed_by UUID, changed_at TIMESTAMPTZ NOT NULL DEFAULT now());
INSERT INTO public.appliance_types (name, vat_rate) VALUES ('Esquentador reparação', 6), ('Vistoria técnica / Seguradora', 23);
INSERT INTO public.service_types (name, base_fee) VALUES ('Lava e Seca', 40);
`);
// gatilhos como em 20261028020000
await db.exec(`
CREATE OR REPLACE FUNCTION public.log_catalog_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$;
CREATE TRIGGER log_appliance_types_change BEFORE UPDATE ON public.appliance_types FOR EACH ROW EXECUTE FUNCTION public.log_catalog_change();
CREATE TRIGGER log_service_types_change BEFORE UPDATE ON public.service_types FOR EACH ROW EXECUTE FUNCTION public.log_catalog_change();
`);
// a versão correta da função entra pela migração de correção
await db.exec(readMigration("20261101000150_fix_catalog_audit.sql"));

// 1) o UPDATE em appliance_types, que antes falhava, agora passa
let erro = null;
try { await db.exec(`UPDATE public.appliance_types SET vat_rate = 23 WHERE name = 'Esquentador reparação'`); }
catch (e) { erro = e.message; }
check("UPDATE em appliance_types não falha mais (era: column base_fee not found)", erro === null, erro || "");

// 2) mudança de IVA em appliance_types é auditada
const auditApp = (await db.query(`SELECT field, old_value, new_value FROM public.settings_audit WHERE table_name = 'appliance_types'`)).rows;
check("mudança de IVA (6 → 23) gera registro de auditoria", auditApp.length === 1 && auditApp[0].field === "vat_rate" && auditApp[0].old_value === "6" && auditApp[0].new_value === "23");

// 3) mudança de taxa base em service_types continua auditada
await db.exec(`UPDATE public.service_types SET base_fee = 45 WHERE name = 'Lava e Seca'`);
const auditSvc = (await db.query(`SELECT field, old_value, new_value FROM public.settings_audit WHERE table_name = 'service_types'`)).rows;
check("mudança de taxa base (40 → 45) em service_types é auditada", auditSvc.length === 1 && auditSvc[0].field === "base_fee" && auditSvc[0].new_value === "45");

// 4) a migração de avisos aplica sem erro e grava os textos
await db.exec(`ALTER TABLE public.appliance_types ADD COLUMN IF NOT EXISTS notice_title TEXT, ADD COLUMN IF NOT EXISTS notice_message TEXT`);
let erroAvisos = null;
try { await db.exec(readMigration("20261101000200_appliance_notices.sql")); } catch (e) { erroAvisos = e.message; }
check("migração de avisos (20261101000200) aplica sem erro", erroAvisos === null, erroAvisos || "");
const aviso = (await db.query(`SELECT notice_title FROM public.appliance_types WHERE name = 'Esquentador reparação'`)).rows[0];
check("aviso do esquentador gravado (Valor do serviço: 85,00€)", aviso?.notice_title === "Valor do serviço: 85,00€");

console.log(failures() ? `\n${failures()} FALHA(S)` : "\nTODOS OS TESTES DE AUDITORIA E AVISOS PASSARAM");
process.exit(failures() ? 1 : 0);
