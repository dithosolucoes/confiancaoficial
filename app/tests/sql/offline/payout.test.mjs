// Repasse ao técnico: regra por snapshot, visita, garantia (migração 20261101000300).
import { PGlite } from "@electric-sql/pglite";
import { readMigration, makeCheck } from "./_db.mjs";

const db = new PGlite();
const { check, failures } = makeCheck();
await db.exec(`
CREATE TABLE public.service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reference text, appliance_type text, is_warranty boolean,
  labor_cost numeric, labor_rejected_at timestamptz, labor_approved_at timestamptz, labor_paid_at timestamptz,
  extra_fee numeric, deslocacao_fee numeric, fixed_payout_amount numeric, quote_additional_value numeric,
  quote_additional_cost numeric, quote_status text, created_at timestamptz DEFAULT now(),
  financial_rule_snapshot jsonb);
CREATE FUNCTION public.resolve_payout_amount(r text, a text) RETURNS numeric LANGUAGE sql AS $$ SELECT 25::numeric $$;
CREATE TABLE public.quote_parts_items (service_id uuid, sale_value numeric, cost_without_vat numeric);
CREATE TABLE public.service_materials (service_id uuid, status text, material_cost numeric, supplier_cost numeric, quantity numeric);
`);
await db.exec(readMigration("20261101000300_warranty_no_visit_payout.sql"));

const ins = async (o) => (await db.query(
  `INSERT INTO public.service_requests (appliance_type,is_warranty,labor_cost,labor_rejected_at,labor_approved_at,labor_paid_at,extra_fee,deslocacao_fee,quote_status,created_at,financial_rule_snapshot)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),$10) RETURNING id`,
  [o.appliance ?? "Máquina de Lavar Roupa", o.warranty ?? false, o.labor ?? 0, o.laborRejected ?? null, null, null, o.extra ?? 0, o.fee ?? 55, o.quote ?? null, o.snap ?? null])).rows[0].id;
const payout = async (id) => Number((await db.query(`SELECT public.resolve_service_payout_amount($1) AS v`, [id])).rows[0].v);
const snap = (vt, lc, vc = true) => JSON.stringify({ visit_technician_pct: vt, labor_confianca_pct: lc, visit_charged: vc });

check("sem snapshot (chamado antigo da regra nova): 50% visita + 50% M.O. = 77.50",
  (await payout(await ins({ labor: 100 }))) === 77.5);
check("regra padrão gravada 50/50 dá o mesmo valor (77.50)",
  (await payout(await ins({ labor: 100, snap: snap(50, 50) }))) === 77.5);
check("regra 40% visita / 50% M.O.: 0.40*55 + 0.50*100 = 72.00",
  (await payout(await ins({ labor: 100, snap: snap(40, 50) }))) === 72);
check("comissão Confiança 30% na M.O.: técnico fica 70% de 100 + 50% de 55 = 97.50",
  (await payout(await ins({ labor: 100, snap: snap(50, 30) }))) === 97.5);
check("visita não cobrada: técnico não recebe pela visita (só M.O. 50) = 50.00",
  (await payout(await ins({ labor: 100, snap: snap(50, 50, false) }))) === 50);
check("orçamento recusado: só visita a 40% = 22.00",
  (await payout(await ins({ labor: 0, quote: "rejected", snap: snap(40, 50) }))) === 22);
check("orçamento recusado com regra padrão = 27.50 (igual ao antigo)",
  (await payout(await ins({ labor: 0, quote: "rejected", snap: snap(50, 50) }))) === 27.5);
check("garantia: sem visita, taxa extra não entra; técnico só 50% da M.O. = 50.00",
  (await payout(await ins({ labor: 100, extra: 30, warranty: true, snap: snap(50, 50) }))) === 50);
check("taxa extra segue % da M.O. (regra 50/50): 0.5*(100+30)+0.5*55 = 92.50",
  (await payout(await ins({ labor: 100, extra: 30, snap: snap(50, 50) }))) === 92.5);
check("snapshot com regra 0% visita, 0% técnico na M.O. (Confiança 100%): só 0 da visita",
  (await payout(await ins({ labor: 100, snap: snap(0, 100) }))) === 0);

console.log(failures() ? `\n${failures()} FALHA(S)` : "\nTODOS OS TESTES DE REPASSE PASSARAM");
process.exit(failures() ? 1 : 0);
