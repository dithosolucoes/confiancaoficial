// Margem sobre peças: o banco calcula o valor para o cliente (migração 20261101000400).
import { PGlite } from "@electric-sql/pglite";
import { readMigration, makeCheck } from "./_db.mjs";

const db = new PGlite();
const { check, failures } = makeCheck();
await db.exec(`
CREATE TABLE public.platform_settings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), key text NOT NULL, value jsonb NOT NULL,
  effective_from timestamptz NOT NULL DEFAULT now(), created_by uuid, created_at timestamptz DEFAULT now());
CREATE TABLE public.service_materials (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), service_request_id uuid, technician_id uuid,
  material_name text, material_cost numeric NOT NULL, supplier_cost numeric, quantity numeric DEFAULT 1, status text DEFAULT 'pending', created_at timestamptz DEFAULT now());
`);
await db.exec(readMigration("20261101000400_parts_markup.sql"));
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const tryExec = async (sql, p = []) => { try { await db.query(sql, p); return null; } catch (e) { return e.message; } };
const mat = async (sup, cost) => (await q(`INSERT INTO public.service_materials (material_name, material_cost, supplier_cost) VALUES ('p', $1, $2) RETURNING id`, [cost, sup]))[0].id;
const row = async (id) => (await q(`SELECT material_cost::float8 AS c, markup_pct::float8 AS m FROM public.service_materials WHERE id=$1`, [id]))[0];

check("margem padrão 15% quando não há configuração gravada", Number((await q(`SELECT public.get_parts_markup_pct() AS v`))[0].v) === 15);
const m1 = await mat(22.5, 0);
let r = await row(m1);
check("peça de custo 22,50 vira 25,88 para o cliente (15%)", r.c === 25.88 && r.m === 15);

await q(`INSERT INTO public.platform_settings (key, value) VALUES ('parts_markup_pct', '40'::jsonb)`);
check("gestor muda para 40%: nova peça usa 40%", (await row(await mat(22.5, 0))).c === 31.5);
r = await row(m1);
check("peça antiga mantém 15% depois da mudança", r.m === 15 && r.c === 25.88);
await q(`UPDATE public.service_materials SET supplier_cost = 30 WHERE id=$1`, [m1]);
r = await row(m1);
check("editar custo de peça antiga usa o % dela (30 x 1,15 = 34,50), não o novo", r.c === 34.5 && r.m === 15);

check("percentual acima de 100 é recusado", (await tryExec(`INSERT INTO public.platform_settings (key, value) VALUES ('parts_markup_pct', '150'::jsonb)`)) !== null);
check("percentual negativo é recusado", (await tryExec(`INSERT INTO public.platform_settings (key, value) VALUES ('parts_markup_pct', '-1'::jsonb)`)) !== null);
check("texto no lugar do número é recusado", (await tryExec(`INSERT INTO public.platform_settings (key, value) VALUES ('parts_markup_pct', '"quinze"'::jsonb)`)) !== null);
check("outras chaves não são validadas por esta regra", (await tryExec(`INSERT INTO public.platform_settings (key, value) VALUES ('min_hours_before_service_change', '24'::jsonb)`)) === null);

const m2 = await mat(0, 50);
r = await row(m2);
check("peça sem custo informado mantém o valor digitado (50)", r.c === 50);

console.log(failures() ? `\n${failures()} FALHA(S)` : "\nTODOS OS TESTES DE MARGEM PASSARAM");
process.exit(failures() ? 1 : 0);
