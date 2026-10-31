// Repasse à empresa parceira vira conta a pagar (migração 20261101001400).
import { PGlite } from "@electric-sql/pglite";
import { readMigration, makeCheck } from "./_db.mjs";

const db = new PGlite();
const { check, failures } = makeCheck();
const GESTOR = "aaaaaaaa-0000-4000-8000-000000000001";
const CLIENTE = "bbbbbbbb-0000-4000-8000-000000000002";
const EMP_A = "11111111-0000-4000-8000-00000000000a";
const EMP_B = "11111111-0000-4000-8000-00000000000b";
const q = async (s, p) => (await db.query(s, p)).rows;
const sql = (s) => db.exec(s);
const expectErr = async (name, fn) => {
  try { await fn(); check(name, false); }
  catch (e) { check(name + " (erro esperado: " + e.message.slice(0, 60) + ")", true); }
};

await sql(`
CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY); INSERT INTO auth.users VALUES ('${GESTOR}'), ('${CLIENTE}');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $$;
CREATE FUNCTION public.is_gestor(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT _user_id = '${GESTOR}'::uuid $$;
CREATE TYPE public.payable_category AS ENUM ('outros');
CREATE TYPE public.payable_status AS ENUM ('pendente','pago','cancelado');
CREATE TABLE public.companies (id uuid PRIMARY KEY, name text NOT NULL);
INSERT INTO public.companies VALUES ('${EMP_A}', 'Empresa A'), ('${EMP_B}', 'Empresa B');
CREATE TABLE public.accounts_payable (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), description text NOT NULL,
  category public.payable_category NOT NULL DEFAULT 'outros', supplier_name text, total_amount numeric(12,2) NOT NULL DEFAULT 0,
  due_date date NOT NULL, status public.payable_status NOT NULL DEFAULT 'pendente', notes text, created_by uuid,
  paid_amount numeric(12,2) NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.service_requests (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), status text, assigned_company_id uuid);
`);
await sql(readMigration("20261101001400_repasse_empresa.sql"));
check("migração aplica sem erro", true);

const mk = async (status, company) => (await q(
  `INSERT INTO public.service_requests (status, assigned_company_id) VALUES ($1,$2) RETURNING id`, [status, company]))[0].id;
const s1 = await mk("completed", EMP_A);
const s2 = await mk("completed", EMP_A);
const s3 = await mk("completed", EMP_B);
const sPend = await mk("in_progress", EMP_A);
const item = (id, company, name, amount) => ({ service_request_id: id, company_id: company, company_name: name, amount });
const itens = [item(s1, EMP_A, "Empresa A", 26), item(s2, EMP_A, "Empresa A", 10.5), item(s3, EMP_B, "Empresa B", 7)];
const contas = async () => Number((await q(`SELECT count(*)::int AS n FROM public.accounts_payable`))[0].n);

await sql(`SET test.uid = '${CLIENTE}'`);
await expectErr("cliente não consegue gerar repasse", () => q(`SELECT public.gerar_repasses_empresas(CURRENT_DATE, $1::jsonb)`, [JSON.stringify(itens)]));

await sql(`SET test.uid = '${GESTOR}'`);
await expectErr("serviço em andamento não pode ser repassado", () =>
  q(`SELECT public.gerar_repasses_empresas(CURRENT_DATE, $1::jsonb)`, [JSON.stringify([item(sPend, EMP_A, "Empresa A", 5)])]));
check("nada foi gravado depois do erro", (await contas()) === 0);

await expectErr("serviço de outra empresa é recusado", () =>
  q(`SELECT public.gerar_repasses_empresas(CURRENT_DATE, $1::jsonb)`, [JSON.stringify([item(s3, EMP_A, "Empresa A", 7)])]));

const [{ n }] = await q(`SELECT public.gerar_repasses_empresas(CURRENT_DATE, $1::jsonb) AS n`, [JSON.stringify(itens)]);
check("gestor gera e a função devolve 3 serviços", Number(n) === 3);
const contasAP = await q(`SELECT supplier_name, total_amount, status FROM public.accounts_payable ORDER BY supplier_name`);
check("uma conta por empresa (2 contas)", contasAP.length === 2);
check("Empresa A: total 36.50 (26 + 10.50), pendente",
  contasAP.some(c => c.supplier_name === "Empresa A" && Number(c.total_amount) === 36.5 && c.status === "pendente"));
check("Empresa B: total 7.00", contasAP.some(c => c.supplier_name === "Empresa B" && Number(c.total_amount) === 7));
const vinc = await q(`SELECT count(*)::int AS n FROM public.company_payouts WHERE payable_id IS NOT NULL`);
check("3 serviços registrados e ligados à conta", Number(vinc[0].n) === 3);

await expectErr("mesmo serviço não é cobrado duas vezes", () =>
  q(`SELECT public.gerar_repasses_empresas(CURRENT_DATE, $1::jsonb)`, [JSON.stringify([item(s1, EMP_A, "Empresa A", 26)])]));
check("continua 2 contas depois da tentativa repetida", (await contas()) === 2);

console.log(failures() ? `\n${failures()} FALHA(S)` : "\nTODOS OS TESTES DE REPASSE À EMPRESA PASSARAM");
process.exit(failures() ? 1 : 0);
