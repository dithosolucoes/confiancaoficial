// Foto fechada dos valores na conclusão (migração 20261101000800).
import { PGlite } from "@electric-sql/pglite";
import { readMigration, makeCheck } from "./_db.mjs";

const db = new PGlite();
const { check, failures } = makeCheck();
const q = async (s, p = []) => (await db.query(s, p)).rows;

await db.exec(`
CREATE TABLE public.service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), status text, deslocacao_fee numeric, labor_cost numeric,
  extra_fee numeric, financial_rule_snapshot jsonb, closing_snapshot jsonb);
CREATE TABLE public.service_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), service_request_id uuid, status text,
  material_cost numeric, supplier_cost numeric, quantity numeric DEFAULT 1);
-- stub: o cálculo do repasse tem teste próprio (payout.test.mjs)
CREATE FUNCTION public.resolve_service_payout_amount(_service_id uuid) RETURNS numeric LANGUAGE sql AS $$ SELECT 77.5::numeric $$;
`);
await db.exec(readMigration("20261101000800_closing_snapshot.sql"));

const S = "22222222-0000-4000-8000-000000000001";
await db.exec(`
INSERT INTO public.service_requests (id, status, deslocacao_fee, labor_cost, extra_fee, financial_rule_snapshot)
VALUES ('${S}', 'in_progress', 55, 100, 30, '{"visit_technician_pct":50}');
INSERT INTO public.service_materials (service_request_id, status, material_cost, supplier_cost, quantity) VALUES
  ('${S}', 'approved', 25.88, 22.5, 1),
  ('${S}', 'approved', 11.50, 10, 2),
  ('${S}', 'pending', 99, 90, 1);
`);
await db.exec(`UPDATE public.service_requests SET status = 'completed' WHERE id = '${S}'`);
const snap = (await q(`SELECT closing_snapshot FROM public.service_requests WHERE id=$1`, [S]))[0].closing_snapshot;
check("concluir grava a foto fechada", snap !== null);
check("foto tem visita, mão de obra e taxa extra", snap.visita === 55 && snap.mao_de_obra === 100 && snap.taxa_extra === 30);
check("peças: soma só as aprovadas, com quantidade (25,88 + 2 x 11,50 = 48,88)", Math.abs(snap.pecas_cliente - 48.88) < 0.001);
check("custo das peças: 22,50 + 2 x 10 = 42,50", Math.abs(snap.pecas_custo - 42.5) < 0.001);
check("margem das peças = cliente - custo (6,38)", Math.abs(snap.margem_pecas - 6.38) < 0.001);
check("foto guarda o repasse e a regra usada", snap.repasse_tecnico === 77.5 && snap.regra_financeira?.visit_technician_pct === 50);

// a foto não muda: depois de mudar a margem/peças e reabrir/concluir de novo, continua igual
await db.exec(`UPDATE public.service_requests SET status = 'in_progress' WHERE id = '${S}'`);
await db.exec(`UPDATE public.service_materials SET material_cost = 999 WHERE service_request_id = '${S}'`);
await db.exec(`UPDATE public.service_requests SET status = 'completed' WHERE id = '${S}'`);
const snap2 = (await q(`SELECT closing_snapshot FROM public.service_requests WHERE id=$1`, [S]))[0].closing_snapshot;
check("foto não é regravada ao concluir de novo", Math.abs(snap2.pecas_cliente - 48.88) < 0.001 && snap2.fechado_em === snap.fechado_em);

console.log(failures() ? `\n${failures()} FALHA(S)` : "\nTODOS OS TESTES DE FOTO FECHADA PASSARAM");
process.exit(failures() ? 1 : 0);
