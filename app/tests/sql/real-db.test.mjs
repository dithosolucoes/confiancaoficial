// Confere o banco REAL do Supabase local (Docker): migrações, funções, gatilhos, políticas e bucket.
// Precisa do Supabase rodando. Variável: DATABASE_URL (o runner pega do 'npx supabase status').
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL não definida"); process.exit(2); }
if (!/127\.0\.0\.1|localhost/.test(url)) { console.error("Recusado: só roda contra o banco local."); process.exit(2); }

const client = new pg.Client({ connectionString: url });
await client.connect();
let fails = 0;
const check = (name, cond, extra = "") => { console.log((cond ? "PASS " : "FAIL ") + name + (extra ? " — " + extra : "")); if (!cond) fails++; };
const q = async (sql, p = []) => (await client.query(sql, p)).rows;

// 1) todas as migrações do projeto aplicadas no banco
const files = fs.readdirSync(path.join(ROOT, "supabase/migrations")).filter(f => f.endsWith(".sql")).map(f => f.split("_")[0]);
const applied = new Set((await q(`SELECT version FROM supabase_migrations.schema_migrations`)).map(r => r.version));
const missing = files.filter(v => !applied.has(v));
check(`todas as ${files.length} migrações do projeto estão aplicadas no banco local`, missing.length === 0, missing.length ? "faltam: " + missing.join(", ") + " (rode: npx supabase migration up)" : "");

// 2) funções
const fns = ["get_parts_markup_pct", "resolve_service_payout_amount", "get_effective_financial_rule", "set_visit_fee_from_service_type", "apply_parts_markup", "validate_parts_markup_setting", "financial_rules_append_only", "is_gestor"];
const haveFns = new Set((await q(`SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'`)).map(r => r.proname));
for (const f of fns) check(`função public.${f} existe`, haveFns.has(f));

// 3) gatilhos
const trgs = [["service_materials", "trg_apply_parts_markup"], ["service_requests", "trg_set_visit_fee_from_service_type"], ["financial_rules", "trg_financial_rules_append_only"], ["platform_settings", "trg_validate_parts_markup_setting"]];
const haveTrg = new Set((await q(`SELECT c.relname, t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE NOT t.tgisinternal`)).map(r => r.relname + "." + r.tgname));
for (const [tbl, name] of trgs) check(`gatilho ${name} em ${tbl}`, haveTrg.has(`${tbl}.${name}`));

// 4) colunas novas do pagamento por fora
const cols = (await q(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='technician_payout_batches'`)).map(r => r.column_name);
check("technician_payout_batches.payment_proof_path existe", cols.includes("payment_proof_path"));
check("technician_payout_batches.payment_reference existe", cols.includes("payment_reference"));

// 5) bucket privado de comprovantes e política de acesso
const bucket = await q(`SELECT public FROM storage.buckets WHERE id = 'payout-proofs'`);
check("bucket payout-proofs existe e é privado", bucket.length === 1 && bucket[0].public === false);
const pol = await q(`SELECT policyname FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Gestores manage payout proofs'`);
check("política 'Gestores manage payout proofs' existe", pol.length === 1);

// 6) política restritiva de chamados (AND com as demais)
const restr = await q(`SELECT policyname, permissive FROM pg_policies WHERE tablename='service_requests' AND policyname='Restrict service_requests visibility'`);
check("política RESTRICTIVE 'Restrict service_requests visibility' existe", restr.length === 1 && restr[0].permissive === "RESTRICTIVE");

// 7) margem e regra padrão
const markup = Number((await q(`SELECT public.get_parts_markup_pct() AS v`))[0].v);
check("margem sobre peças tem valor entre 0 e 100", markup >= 0 && markup <= 100, `atual=${markup}%`);
const [{ n }] = await q(`SELECT count(*)::int AS n FROM public.financial_rules WHERE service_type_id IS NULL`);
check("regra financeira padrão existe no banco", n >= 1);

// 8) transação de teste: muda a margem, confere e desfaz (não deixa rastro)
await client.query("BEGIN");
try {
  await client.query(`INSERT INTO public.platform_settings (key, value) VALUES ('parts_markup_pct', '37'::jsonb)`);
  const v = Number((await q(`SELECT public.get_parts_markup_pct() AS v`))[0].v);
  check("dentro de transação: nova margem 37% vale na hora", v === 37);
} finally {
  await client.query("ROLLBACK");
}
check("após ROLLBACK a margem volta ao valor anterior", Number((await q(`SELECT public.get_parts_markup_pct() AS v`))[0].v) === markup);

// 9) pagamentos (migrações 000700, 000800, 000900): ponto único, ledger, foto fechada
const ledgerTable = await q(`SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='service_payments'`);
check("tabela service_payments existe", ledgerTable.length === 1);
const ledgerRls = await q(`SELECT relrowsecurity FROM pg_class WHERE oid = 'public.service_payments'::regclass`);
check("service_payments tem RLS ativo", ledgerRls[0]?.relrowsecurity === true);
const ledgerTriggers = await q(`SELECT count(*)::int AS n FROM pg_trigger WHERE tgrelid = 'public.service_payments'::regclass AND NOT tgisinternal`);
check("service_payments tem gatilho de imutabilidade (append-only)", ledgerTriggers[0].n >= 1);
const cannotDelete = await q(`SELECT has_table_privilege('authenticated', 'public.service_payments', 'DELETE') AS v`);
const cannotUpdate = await q(`SELECT has_table_privilege('authenticated', 'public.service_payments', 'UPDATE') AS v`);
check("authenticated não pode apagar nem alterar service_payments", cannotDelete[0].v === false && cannotUpdate[0].v === false);
const confirmSig = "public.confirmar_pagamento(uuid,text,numeric,numeric,text,text,text,uuid)";
const cliente = await q(`SELECT has_function_privilege('authenticated', $1, 'EXECUTE') AS v`, [confirmSig]);
const servico = await q(`SELECT has_function_privilege('service_role', $1, 'EXECUTE') AS v`, [confirmSig]);
check("confirmar_pagamento: só service_role executa (cliente não)", cliente[0].v === false && servico[0].v === true);
const manualSig = "public.registrar_pagamento_manual(uuid,text,numeric,numeric,text,text,text)";
const manualAuth = await q(`SELECT has_function_privilege('authenticated', $1, 'EXECUTE') AS v`, [manualSig]);
check("registrar_pagamento_manual existe e autenticado pode chamar (a função checa se é gestor)", manualAuth[0]?.v === true);
const estornoAuth = await q(`SELECT has_function_privilege('authenticated', 'public.estornar_pagamento(uuid,text)', 'EXECUTE') AS v`);
check("estornar_pagamento existe e autenticado pode chamar (a função checa se é gestor)", estornoAuth[0]?.v === true);
const closingCol = await q(`SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='service_requests' AND column_name='closing_snapshot'`);
check("service_requests.closing_snapshot existe (foto fechada)", closingCol.length === 1);
const closingFn = await q(`SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname='public' AND p.proname='set_closing_snapshot'`);
check("função set_closing_snapshot existe", closingFn.length === 1);

await client.end();
console.log(fails ? `\n${fails} FALHA(S) no banco real` : "\nBANCO REAL: TODAS AS CHECAGENS PASSARAM");
process.exit(fails ? 1 : 0);
