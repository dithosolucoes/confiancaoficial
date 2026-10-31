// Aprovação de repasse acima do valor de corte (migração 20261101001000).
import { PGlite } from "@electric-sql/pglite";
import { readMigration, makeCheck } from "./_db.mjs";

const db = new PGlite();
const { check, failures } = makeCheck();
const GESTOR = "aaaaaaaa-0000-4000-8000-000000000001";
const TECNICO = "cccccccc-0000-4000-8000-000000000003";
const q = async (s, p = []) => (await db.query(s, p)).rows;
const tryQ = async (s, p = []) => { try { await db.query(s, p); return null; } catch (e) { return e.message; } };

await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $$;
CREATE FUNCTION public.is_gestor(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT _user_id = '${GESTOR}'::uuid $$;
CREATE TABLE public.platform_settings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), key text NOT NULL, value jsonb NOT NULL, effective_from timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.technician_payout_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), technician_id uuid, total_amount numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open', paid_at timestamptz);
GRANT SELECT, UPDATE ON public.technician_payout_batches TO authenticated;
GRANT SELECT ON public.platform_settings TO authenticated;
`);
await db.exec(readMigration("20261101001000_payout_approval.sql"));

const B_SEM = "22222222-0000-4000-8000-000000000001"; // 500, sem corte
const B_GRANDE = "22222222-0000-4000-8000-000000000002"; // 150, acima do corte de 100
const B_PEQUENO = "22222222-0000-4000-8000-000000000003"; // 80, abaixo do corte
await q(`INSERT INTO public.technician_payout_batches (id, technician_id, total_amount) VALUES
  ('${B_SEM}', '${TECNICO}', 500), ('${B_GRANDE}', '${TECNICO}', 150), ('${B_PEQUENO}', '${TECNICO}', 80)`);

// 1) sem chave de corte: nada muda, lote pode ser pago direto
await q(`SET ROLE authenticated`);
const semCorte = await tryQ(`UPDATE public.technician_payout_batches SET status='paid', paid_at=now() WHERE id=$1`, [B_SEM]);
await q(`RESET ROLE`);
check("sem valor de corte: lote pode ser pago sem aprovação", semCorte === null);
check("sem valor de corte: função de necessidade devolve falso", (await q(`SELECT public.payout_needs_approval(999) AS v`))[0].v === false);

// 2) liga o corte em 100
await q(`INSERT INTO public.platform_settings (key, value) VALUES ('payout_approval_threshold', '100'::jsonb)`);
check("valor de corte lido do banco (100)", Number((await q(`SELECT public.payout_approval_threshold() AS v`))[0].v) === 100);

// 3) acima do corte: não paga sem aprovação
await q(`SET ROLE authenticated`);
const semAprov = await tryQ(`UPDATE public.technician_payout_batches SET status='paid', paid_at=now() WHERE id=$1`, [B_GRANDE]);
await q(`RESET ROLE`);
check("acima do corte: bloqueia pagamento sem aprovação", semAprov !== null && semAprov.includes("aprovação"));

// 4) abaixo do corte: paga sem aprovação
await q(`SET ROLE authenticated`);
const abaixo = await tryQ(`UPDATE public.technician_payout_batches SET status='paid', paid_at=now() WHERE id=$1`, [B_PEQUENO]);
await q(`RESET ROLE`);
check("abaixo do corte: paga sem aprovação", abaixo === null);

// 5) só o gestor aprova
await q(`SET ROLE authenticated`); await q(`SELECT set_config('test.uid', '${TECNICO}', false)`);
const erroTecnico = await tryQ(`SELECT public.aprovar_lote_repasse($1::uuid[])`, [`{${B_GRANDE}}`]);
await q(`SELECT set_config('test.uid', '${GESTOR}', false)`);
const aprovados = (await q(`SELECT public.aprovar_lote_repasse($1::uuid[]) AS n`, [`{${B_GRANDE}}`]))[0].n;
const aprovadosDeNovo = (await q(`SELECT public.aprovar_lote_repasse($1::uuid[]) AS n`, [`{${B_GRANDE}}`]))[0].n;
await q(`RESET ROLE`);
check("técnico não consegue aprovar lote", erroTecnico !== null);
check("gestor aprova o lote aberto", Number(aprovados) === 1);
check("aprovar de novo não altera nada", Number(aprovadosDeNovo) === 0);

// 6) depois de aprovado, paga
await q(`SET ROLE authenticated`);
const depoisAprov = await tryQ(`UPDATE public.technician_payout_batches SET status='paid', paid_at=now() WHERE id=$1`, [B_GRANDE]);
await q(`RESET ROLE`);
const quem = (await q(`SELECT approved_by::text AS by, approved_at IS NOT NULL AS ok FROM public.technician_payout_batches WHERE id=$1`, [B_GRANDE]))[0];
check("depois de aprovado, o lote é pago", depoisAprov === null);
check("aprovação grava o gestor e a data", quem.by === GESTOR && quem.ok === true);

// 7) chave com valor nulo desliga o corte de novo
await q(`INSERT INTO public.platform_settings (key, value, effective_from) VALUES ('payout_approval_threshold', 'null'::jsonb, now() + interval '1 second')`);
check("chave nula desliga o corte", (await q(`SELECT public.payout_approval_threshold() AS v`))[0].v === null);

console.log(failures() ? `\n${failures()} FALHA(S)` : "\nTODOS OS TESTES DE APROVAÇÃO DE REPASSE PASSARAM");
process.exit(failures() ? 1 : 0);
