// Empresa parceira na divisão: colunas e travas (20261101001200), snapshot e repasse ao técnico.
// Aplica 000000 (regras), 000300 (repasse) e 001200 (empresa parceira), nesta ordem.
import { PGlite } from "@electric-sql/pglite";
import { readMigration, makeCheck } from "./_db.mjs";

const db = new PGlite();
const { check, failures } = makeCheck();
const GESTOR = "aaaaaaaa-0000-4000-8000-000000000001";
const CUSTOMER = "bbbbbbbb-0000-4000-8000-000000000002";
const COMPANY = "cccccccc-0000-4000-8000-000000000003";
const sql = (s) => db.exec(s);
const q = async (s, p) => (await db.query(s, p)).rows;
const expectErr = async (name, fn) => {
  try { await fn(); check(name, false); }
  catch (e) { check(name + " (erro esperado: " + e.message.slice(0, 60) + ")", true); }
};

await sql(`
CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY); INSERT INTO auth.users VALUES ('${GESTOR}'), ('${CUSTOMER}');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $$;
CREATE FUNCTION public.is_gestor(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT _user_id = '${GESTOR}'::uuid $$;
CREATE TABLE public.service_types (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, base_fee numeric, sort_order int default 0);
CREATE TABLE public.service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reference text, appliance_type text, is_warranty boolean,
  labor_cost numeric, labor_rejected_at timestamptz, labor_approved_at timestamptz, labor_paid_at timestamptz,
  extra_fee numeric, deslocacao_fee numeric, fixed_payout_amount numeric, quote_additional_value numeric,
  quote_additional_cost numeric, quote_status text, created_at timestamptz NOT NULL DEFAULT now(),
  service_type_id uuid REFERENCES public.service_types(id) ON DELETE SET NULL, status text,
  assigned_company_id uuid);
CREATE FUNCTION public.resolve_payout_amount(r text, a text) RETURNS numeric LANGUAGE sql AS $$ SELECT 25::numeric $$;
CREATE TABLE public.quote_parts_items (service_id uuid, sale_value numeric, cost_without_vat numeric);
CREATE TABLE public.service_materials (service_id uuid, status text, material_cost numeric, supplier_cost numeric, quantity numeric);
`);
await sql(readMigration("20261101000000_financial_rules.sql"));
await sql(readMigration("20261101000300_warranty_no_visit_payout.sql"));
await sql(readMigration("20261101001200_empresa_parceira_split.sql"));
check("as três migrações aplicam sem erro", true);

// 1) Padrão: colunas novas existem e a regra padrão nasce com 0% de empresa.
const [seed] = await q(`SELECT visit_empresa_pct, labor_empresa_pct FROM public.financial_rules WHERE service_type_id IS NULL`);
check("regra padrão existente nasce com empresa = 0% (visita e M.O.)",
  Number(seed.visit_empresa_pct) === 0 && Number(seed.labor_empresa_pct) === 0);

// 2) Regra com empresa para um tipo de serviço.
const [{ id: typeId }] = await q(`INSERT INTO public.service_types (name, base_fee) VALUES ('Lava e Seca', 60) RETURNING id`);
await sql(`SET test.uid = '${GESTOR}'`);
await q(`INSERT INTO public.financial_rules (service_type_id, visit_charged, visit_technician_pct, labor_confianca_pct, visit_empresa_pct, labor_empresa_pct, effective_from, reason)
         VALUES ($1, true, 50, 50, 10, 20, now() - interval '1 day', 'Teste empresa parceira')`, [typeId]);
await sql(`SET test.uid = '${CUSTOMER}'`);

// 3) Travas: empresa não passa do técnico na visita, nem do que sobra na M.O.
await expectErr("trava: empresa na visita (60) maior que técnico na visita (50) é recusada",
  () => q(`INSERT INTO public.financial_rules (service_type_id, visit_charged, visit_technician_pct, labor_confianca_pct, visit_empresa_pct, labor_empresa_pct, effective_from, reason)
           VALUES ($1, true, 50, 50, 60, 0, now(), 'x')`, [typeId]));
await expectErr("trava: empresa na M.O. (60) maior que sobra depois da Confiança (50) é recusada",
  () => q(`INSERT INTO public.financial_rules (service_type_id, visit_charged, visit_technician_pct, labor_confianca_pct, visit_empresa_pct, labor_empresa_pct, effective_from, reason)
           VALUES ($1, true, 50, 50, 0, 60, now(), 'x')`, [typeId]));

// 4) Snapshot do chamado guarda as duas % novas.
const ins = async (o) => (await db.query(
  `INSERT INTO public.service_requests (service_type_id, appliance_type, is_warranty, labor_cost, deslocacao_fee, extra_fee, quote_status, assigned_company_id, status)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending') RETURNING id`,
  [typeId, "Máquina de Lavar Roupa", o.warranty ?? false, o.labor ?? 0, o.fee ?? 60, o.extra ?? 0, o.quote ?? null, o.company ?? null])).rows[0].id;
const payout = async (id) => Number((await db.query(`SELECT public.resolve_service_payout_amount($1) AS v`, [id])).rows[0].v);

const aId = await ins({ labor: 100 });
const [{ financial_rule_snapshot: snapA }] = await q(`SELECT financial_rule_snapshot FROM public.service_requests WHERE id = $1`, [aId]);
check("snapshot do chamado traz visit_empresa_pct = 10 e labor_empresa_pct = 20",
  Number(snapA?.visit_empresa_pct) === 10 && Number(snapA?.labor_empresa_pct) === 20);

// 5) Repasse ao técnico (vetor: visita 60, M.O. 100, técnico 50%, Confiança 50%, empresa 10% visita e 20% M.O.).
check("chamado SEM empresa: técnico recebe 80 (50% visita + 50% M.O.)", (await payout(aId)) === 80);
const bId = await ins({ labor: 100, company: COMPANY });
check("chamado COM empresa: técnico recebe 54 (empresa tira 10% visita e 20% M.O. da parte dele)", (await payout(bId)) === 54);
const cId = await ins({ labor: 100, company: COMPANY, warranty: true });
check("garantia COM empresa: sem visita; técnico 30 (30% da M.O.)", (await payout(cId)) === 30);
const dId = await ins({ labor: 0, company: COMPANY, quote: "rejected" });
check("orçamento recusado COM empresa: só visita; técnico 24 (40% de 60)", (await payout(dId)) === 24);

// 6) Regra antiga, sem as chaves de empresa no snapshot: empresa zero.
// Cliente não consegue mexer no snapshot (trigger guard_service_financial_rule reverte).
await sql(`UPDATE public.service_requests SET financial_rule_snapshot = '{"visit_technician_pct":10}'::jsonb WHERE id = '${bId}'`);
const [{ financial_rule_snapshot: afterCustomer }] = await q(`SELECT financial_rule_snapshot FROM public.service_requests WHERE id = $1`, [bId]);
check("cliente não consegue alterar o snapshot do chamado (guard mantém os valores)", afterCustomer?.visit_empresa_pct !== undefined);
// Gestor grava snapshot antigo (sem as chaves de empresa): empresa zero, técnico volta a 80.
await sql(`SET test.uid = '${GESTOR}'`);
await sql(`UPDATE public.service_requests SET financial_rule_snapshot = '{"visit_technician_pct":50,"labor_confianca_pct":50,"visit_charged":true}'::jsonb WHERE id = '${bId}'`);
check("snapshot antigo (sem chaves de empresa) não tira nada do técnico: 80", (await payout(bId)) === 80);

console.log(failures() ? `\n${failures()} FALHA(S)` : "\nTODOS OS TESTES DE EMPRESA PARCEIRA PASSARAM");
process.exit(failures() ? 1 : 0);
