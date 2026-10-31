// Garantias presas em payment_pending voltam para pending (migração 20261101001300).
import { PGlite } from "@electric-sql/pglite";
import { readMigration, makeCheck } from "./_db.mjs";

const db = new PGlite();
const { check, failures } = makeCheck();
await db.exec(`
CREATE TABLE public.service_requests (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), is_warranty boolean, status text, financial_rule_snapshot jsonb);
CREATE TABLE public.service_payments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), service_request_id uuid, amount numeric);
`);
const ins = async (warranty, status, paid = null) => {
  const [{ id }] = (await db.query(`INSERT INTO public.service_requests (is_warranty, status, financial_rule_snapshot) VALUES ($1,$2,'{"visit_charged":false}') RETURNING id`, [warranty, status])).rows;
  if (paid !== null) await db.query(`INSERT INTO public.service_payments (service_request_id, amount) VALUES ($1,$2)`, [id, paid]);
  return id;
};
const st = async (id) => (await db.query(`SELECT status, financial_rule_snapshot FROM public.service_requests WHERE id=$1`, [id])).rows[0];

const garantiaPresa = await ins(true, "payment_pending");
const garantiaPaga = await ins(true, "payment_pending", 10);
const normalPresa = await ins(false, "payment_pending");
const garantiaOutra = await ins(true, "accepted");
const snapAntes = (await st(garantiaPresa)).financial_rule_snapshot;

await db.exec(readMigration("20261101001300_garantia_presa_pendente.sql"));

check("garantia presa (sem pagamento) volta para pending", (await st(garantiaPresa)).status === "pending");
check("garantia com pagamento registrado fica como está", (await st(garantiaPaga)).status === "payment_pending");
check("chamado normal em payment_pending não é mexido", (await st(normalPresa)).status === "payment_pending");
check("garantia em outro status não é mexida", (await st(garantiaOutra)).status === "accepted");
check("snapshot de regra não muda", JSON.stringify((await st(garantiaPresa)).financial_rule_snapshot) === JSON.stringify(snapAntes));

console.log(failures() ? `\n${failures()} FALHA(S)` : "\nTODOS OS TESTES DE GARANTIA PRESA PASSARAM");
process.exit(failures() ? 1 : 0);
