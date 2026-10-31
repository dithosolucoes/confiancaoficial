// Regras financeiras em versões (migração 20261101000000): snapshot, histórico imutável, validações.
import { PGlite } from "@electric-sql/pglite";
import { readMigration, makeCheck } from "./_db.mjs";

const db = new PGlite();
const { check, failures } = makeCheck();
const GESTOR = "aaaaaaaa-0000-4000-8000-000000000001";
const CUSTOMER = "bbbbbbbb-0000-4000-8000-000000000002";
const sql = (s) => db.exec(s);
const q = async (s, p) => (await db.query(s, p)).rows;
const expectErr = async (name, fn) => { try { await fn(); check(name, false); } catch (e) { check(name + " (erro esperado: " + e.message.slice(0, 60) + ")", true); } };

await sql(`
CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY); INSERT INTO auth.users VALUES ('${GESTOR}'), ('${CUSTOMER}');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $$;
CREATE FUNCTION public.is_gestor(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT _user_id = '${GESTOR}'::uuid $$;
CREATE TABLE public.service_types (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, base_fee numeric, sort_order int default 0);
CREATE TABLE public.service_requests (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(), service_type_id uuid REFERENCES public.service_types(id) ON DELETE SET NULL, status text);
`);
await sql(readMigration("20261101000000_financial_rules.sql"));
check("migração aplicou sem erro", true);

const [{ count: seeded }] = await q(`SELECT count(*)::int AS count FROM public.financial_rules WHERE service_type_id IS NULL`);
check("regra padrão inicial existe (1 linha)", seeded === 1);

const [{ id: typeId }] = await q(`INSERT INTO public.service_types (name, base_fee) VALUES ('Lava e Seca', 40) RETURNING id`);

await sql(`SET test.uid = '${GESTOR}'`);
await q(`INSERT INTO public.financial_rules (service_type_id, visit_charged, visit_technician_pct, labor_confianca_pct, effective_from, reason)
         VALUES ($1, true, 40, 30, now() - interval '1 day', 'Acordo de teste')`, [typeId]);

await sql(`SET test.uid = '${CUSTOMER}'`);
const [sr1] = await q(`INSERT INTO public.service_requests (service_type_id, status) VALUES ($1, 'pending') RETURNING id, financial_rule_id, financial_rule_snapshot`, [typeId]);
check("chamado com tipo recebe a regra do tipo", sr1.financial_rule_snapshot?.visit_technician_pct === 40 && sr1.financial_rule_snapshot?.labor_confianca_pct === 30);

const [sr2] = await q(`INSERT INTO public.service_requests (status) VALUES ('pending') RETURNING financial_rule_snapshot`);
check("chamado sem tipo usa a regra padrão 50/50", Number(sr2.financial_rule_snapshot?.visit_technician_pct) === 50);

await q(`UPDATE public.service_requests SET financial_rule_snapshot = NULL, financial_rule_id = NULL WHERE id = $1`, [sr1.id]);
const [after] = await q(`SELECT financial_rule_snapshot FROM public.service_requests WHERE id = $1`, [sr1.id]);
check("cliente não consegue apagar o snapshot da regra", after.financial_rule_snapshot?.visit_technician_pct === 40);

await sql(`SET test.uid = '${GESTOR}'`);
await q(`INSERT INTO public.financial_rules (service_type_id, visit_charged, visit_technician_pct, labor_confianca_pct, effective_from, reason)
         VALUES ($1, true, 60, 20, now() + interval '30 days', 'Mudança futura')`, [typeId]);
const [sr3] = await q(`SELECT (get_effective_financial_rule($1, now())).visit_technician_pct AS pct`, [typeId]);
check("versão futura não vale agora", Number(sr3.pct) === 40);

await q(`INSERT INTO public.financial_rules (service_type_id, visit_charged, visit_technician_pct, labor_confianca_pct, effective_from, reason)
         VALUES ($1, false, 55, 25, now() - interval '1 hour', 'Revisão')`, [typeId]);
await sql(`SET test.uid = '${CUSTOMER}'`);
const [sr4] = await q(`INSERT INTO public.service_requests (service_type_id, status) VALUES ($1, 'pending') RETURNING financial_rule_snapshot`, [typeId]);
check("chamado novo pega a versão mais recente vigente", sr4.financial_rule_snapshot?.visit_technician_pct === 55 && sr4.financial_rule_snapshot?.visit_charged === false);
const [old] = await q(`SELECT financial_rule_snapshot FROM public.service_requests WHERE id = $1`, [sr1.id]);
check("chamado antigo continua com a regra de 40%", old.financial_rule_snapshot?.visit_technician_pct === 40);

await sql(`SET test.uid = '${GESTOR}'`);
await expectErr("gestor não consegue alterar uma regra", () => q(`UPDATE public.financial_rules SET visit_technician_pct = 99 WHERE service_type_id = $1`, [typeId]));
await expectErr("gestor não consegue apagar uma regra", () => q(`DELETE FROM public.financial_rules WHERE service_type_id = $1`, [typeId]));
await expectErr("percentual acima de 100 é recusado", () => q(`INSERT INTO public.financial_rules (visit_technician_pct, reason) VALUES (101, 'teste')`));
await expectErr("motivo vazio é recusado", () => q(`INSERT INTO public.financial_rules (visit_technician_pct, reason) VALUES (50, '  ')`));
await expectErr("tipo de serviço com regra não pode ser apagado", () => q(`DELETE FROM public.service_types WHERE id = $1`, [typeId]));

console.log(failures() === 0 ? "\nTODOS OS TESTES DE REGRAS PASSARAM" : `\n${failures()} FALHA(S)`);
process.exit(failures() ? 1 : 0);
