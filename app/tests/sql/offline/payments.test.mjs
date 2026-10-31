// Pagamento com ponto único, divergência, estorno e permissões (migração 20261101000700).
import { PGlite } from "@electric-sql/pglite";
import { readMigration, makeCheck } from "./_db.mjs";

const db = new PGlite();
const { check, failures } = makeCheck();
const GESTOR = "aaaaaaaa-0000-4000-8000-000000000001";
const CLIENTE = "bbbbbbbb-0000-4000-8000-000000000002";
const q = async (s, p = []) => (await db.query(s, p)).rows;
const tryQ = async (s, p = []) => { try { await db.query(s, p); return null; } catch (e) { return e.message; } };

await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $$;
CREATE FUNCTION public.is_gestor(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT _user_id = '${GESTOR}'::uuid $$;
CREATE TABLE public.platform_settings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), key text NOT NULL, value jsonb NOT NULL, effective_from timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id uuid, status text, quote_status text,
  booking_paid_at timestamptz, labor_paid_at timestamptz, quote_paid_at timestamptz, materials_paid_at timestamptz,
  quote_payment_source text, quote_payment_method text);
CREATE TABLE public.service_materials (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), service_request_id uuid, status text);
ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;
`);
await db.exec(readMigration("20261101000700_payments_single_point.sql"));
await db.exec(readMigration("20261101000900_gestor_payments.sql"));

const S1 = "11111111-0000-4000-8000-000000000001";
const S2 = "11111111-0000-4000-8000-000000000002";
await db.exec(`
INSERT INTO public.service_requests (id, customer_id, status) VALUES ('${S1}', '${CLIENTE}', 'payment_pending'), ('${S2}', '${CLIENTE}', 'quote_sent');
INSERT INTO public.service_materials (service_request_id, status) VALUES ('${S2}', 'pending'), ('${S2}', 'pending');
`);
const confirm = (sid, type, amount, expected, src = "simulado") =>
  q(`SELECT public.confirmar_pagamento($1,$2,$3,$4,'cartao',$5,NULL,NULL) AS id`, [sid, type, amount, expected, src]);

// 1) agendamento: payment_pending vira pending e registra o pagamento
await q(`SET ROLE service_role`);
const p1 = (await confirm(S1, "booking", 66.5, 66.5))[0].id;
await q(`RESET ROLE`);
const s1 = (await q(`SELECT status, booking_paid_at FROM public.service_requests WHERE id=$1`, [S1]))[0];
check("agendamento pago: status vai de payment_pending para pending", s1.status === "pending");
check("agendamento pago: data do pagamento gravada", s1.booking_paid_at !== null);
const l1 = (await q(`SELECT amount::float8 AS a, source FROM public.service_payments WHERE id=$1`, [p1]))[0];
check("lançamento gravado com valor e origem", l1.a === 66.5 && l1.source === "simulado");
check("valor igual ao esperado não gera divergência", (await q(`SELECT count(*)::int AS n FROM public.payment_divergences`))[0].n === 0);

// 2) orçamento: quote_sent vira quote_accepted e materiais pendentes continuam pendentes até o pagamento de peças
await q(`SET ROLE service_role`);
await confirm(S2, "quote", 120, 120);
await q(`RESET ROLE`);
const s2 = (await q(`SELECT status, quote_status, quote_payment_source FROM public.service_requests WHERE id=$1`, [S2]))[0];
check("orçamento pago: quote_sent vira quote_accepted", s2.status === "quote_accepted" && s2.quote_status === "accepted");
check("orçamento pago: origem do pagamento gravada", s2.quote_payment_source === "simulado");

// 3) pagamento de peças aprova os materiais pendentes
await q(`SET ROLE service_role`);
await confirm(S2, "materials", 40, 40);
await q(`RESET ROLE`);
const mats = (await q(`SELECT count(*)::int AS n FROM public.service_materials WHERE service_request_id=$1 AND status='approved'`, [S2]))[0].n;
check("pagamento de peças aprova os materiais pendentes", mats === 2);

// 4) divergência: esperado 50, pagou 45 -> entra na fila do gestor
await q(`SET ROLE service_role`);
await confirm(S2, "labor", 45, 50);
await q(`RESET ROLE`);
const div = await q(`SELECT expected_amount::float8 AS e, paid_amount::float8 AS p, status FROM public.payment_divergences`);
check("valor pago diferente do esperado gera divergência aberta", div.length === 1 && div[0].e === 50 && div[0].p === 45 && div[0].status === "aberta");

// 5) só o servidor confirma: cliente não consegue chamar direto
await q(`SET ROLE authenticated`);
const erroCliente = await tryQ(`SELECT public.confirmar_pagamento('${S1}','labor',10,10,'x','simulado',NULL,NULL)`);
await q(`RESET ROLE`);
check("cliente não consegue chamar a confirmação direto", erroCliente !== null);

// 6) lançamento não se altera nem apaga
check("pagamento não pode ser alterado", (await tryQ(`UPDATE public.service_payments SET amount = 1`)) !== null);
check("pagamento não pode ser apagado", (await tryQ(`DELETE FROM public.service_payments`)) !== null);

// 7) estorno: gestor faz lançamento novo negativo; não se estorna duas vezes; cliente não estorna
const pagId = (await q(`SELECT id FROM public.service_payments WHERE payment_type='booking' LIMIT 1`))[0].id;
await q(`SET ROLE authenticated`); await q(`SELECT set_config('test.uid', '${CLIENTE}', false)`);
const erroEstornoCliente = await tryQ(`SELECT public.estornar_pagamento('${pagId}', 'cliente tentando')`);
await q(`RESET ROLE`);
check("cliente não consegue estornar", erroEstornoCliente !== null);

await q(`SET ROLE authenticated`); await q(`SELECT set_config('test.uid', '${GESTOR}', false)`);
const estorno = (await q(`SELECT public.estornar_pagamento('${pagId}', 'cliente cancelou o agendamento') AS id`))[0].id;
const erroDuplo = await tryQ(`SELECT public.estornar_pagamento('${pagId}', 'de novo')`);
const erroSemMotivo = await tryQ(`SELECT public.estornar_pagamento('${p1}', '')`);
await q(`RESET ROLE`);
const est = (await q(`SELECT amount::float8 AS a, reversal_of FROM public.service_payments WHERE id=$1`, [estorno]))[0];
check("estorno é lançamento novo com valor negativo", est.a === -66.5 && est.reversal_of === pagId);
check("não estorna o mesmo pagamento duas vezes", erroDuplo !== null);
check("estorno exige motivo", erroSemMotivo !== null);
check("o pagamento original continua registrado (não foi apagado)", (await q(`SELECT count(*)::int AS n FROM public.service_payments WHERE id=$1`, [pagId]))[0].n === 1);

// 7) pagamento manual do gestor passa pelo ponto único (migração 20261101000900)
const S3 = "11111111-0000-4000-8000-000000000003";
const S4 = "11111111-0000-4000-8000-000000000004";
await q(`INSERT INTO public.service_requests (id, customer_id, status) VALUES ('${S3}', '${CLIENTE}', 'quote_sent'), ('${S4}', '${CLIENTE}', 'quote_sent')`);
await q(`SET ROLE authenticated`);
await q(`SELECT set_config('test.uid', '${CLIENTE}', false)`);
const erroManualCliente = await tryQ(`SELECT public.registrar_pagamento_manual('${S3}','quote',50,50,'bank_transfer','REF0',NULL)`);
await q(`SELECT set_config('test.uid', '${GESTOR}', false)`);
const manualOk = (await q(`SELECT public.registrar_pagamento_manual($1,'quote',50,50,'bank_transfer','REF1','Recebido no IBAN') AS id`, [S3]))[0].id;
const manualDiv = (await q(`SELECT public.registrar_pagamento_manual($1,'quote',45,50,'cash',NULL,NULL) AS id`, [S4]))[0].id;
const divId = (await q(`SELECT id FROM public.payment_divergences WHERE payment_id=$1`, [manualDiv]))[0]?.id;
await q(`UPDATE public.payment_divergences SET status='resolvida', resolution_note='cliente pagou o restante em dinheiro', resolved_by='${GESTOR}', resolved_at=now() WHERE id=$1`, [divId]);
const divDepois = (await q(`SELECT status FROM public.payment_divergences WHERE id=$1`, [divId]))[0];
await q(`RESET ROLE`);
const manualRow = (await q(`SELECT amount::float8 AS a, source, reference FROM public.service_payments WHERE id=$1`, [manualOk]))[0];
check("pagamento manual: lançamento com origem manual, valor e referência", manualRow.source === "manual" && manualRow.a === 50 && manualRow.reference === "REF1");
const s3 = (await q(`SELECT quote_payment_source, quote_payment_note, quote_payment_marked_by::text AS by, quote_status, status FROM public.service_requests WHERE id=$1`, [S3]))[0];
check("pagamento manual: serviço com origem manual, observação e gestor que registrou", s3.quote_payment_source === "manual" && s3.quote_payment_note === "Recebido no IBAN" && s3.by === GESTOR);
check("pagamento manual: orçamento vira aceito", s3.status === "quote_accepted" && s3.quote_status === "accepted");
check("cliente não consegue registrar pagamento manual", erroManualCliente !== null);
check("valor diferente do esperado abre divergência para o gestor", divId !== undefined);
check("gestor resolve a divergência com nota", divDepois?.status === "resolvida");

console.log(failures() ? `\n${failures()} FALHA(S)` : "\nTODOS OS TESTES DE PAGAMENTO PASSARAM");
process.exit(failures() ? 1 : 0);
