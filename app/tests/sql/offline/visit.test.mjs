// Taxa de visita vem da taxa base do tipo de serviço (migração 20261101000600).
import { PGlite } from "@electric-sql/pglite";
import { readMigration, makeCheck } from "./_db.mjs";

const db = new PGlite();
const { check, failures } = makeCheck();
await db.exec(`CREATE TABLE public.service_requests (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), deslocacao_fee numeric, service_type_base_fee numeric);`);
await db.exec(readMigration("20261101000600_visit_fee_from_service_type.sql"));
const ins = async (fee, base) => (await db.query(`INSERT INTO public.service_requests (deslocacao_fee, service_type_base_fee) VALUES ($1,$2) RETURNING deslocacao_fee::float8 AS f`, [fee, base])).rows[0].f;

check("sem deslocação informada, usa a taxa base do tipo (40)", (await ins(null, 40)) === 40);
check("deslocação informada pelo gestor não muda (30)", (await ins(30, 40)) === 30);
check("sem tipo de serviço continua vazio (null)", (await ins(null, null)) === null);
check("tipo com taxa base 0 não preenche", (await ins(null, 0)) === null);

console.log(failures() ? `${failures()} FALHA(S)` : "TODOS PASSARAM");
process.exit(failures() ? 1 : 0);
