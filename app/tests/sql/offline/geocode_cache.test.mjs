// Tabela de cache de geocodificação (migração 20261101001100).
import { PGlite } from "@electric-sql/pglite";
import { readMigration, makeCheck } from "./_db.mjs";

const db = new PGlite();
const { check, failures } = makeCheck();
const q = async (s, p = []) => (await db.query(s, p)).rows;
const tryQ = async (s, p = []) => { try { await db.query(s, p); return null; } catch (e) { return e.message; } };

await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;`);
await db.exec(readMigration("20261101001100_geocode_cache.sql"));

const existe = (await q(`SELECT to_regclass('public.geocode_cache') IS NOT NULL AS v`))[0].v;
check("tabela geocode_cache criada", existe === true);

const rls = (await q(`SELECT relrowsecurity AS v FROM pg_class WHERE oid = 'public.geocode_cache'::regclass`))[0].v;
check("RLS ligado em geocode_cache", rls === true);

const priv = (await q(`SELECT has_table_privilege('authenticated','public.geocode_cache','SELECT') AS v`))[0].v;
check("authenticated não tem SELECT", priv === false);

const privAnon = (await q(`SELECT has_table_privilege('anon','public.geocode_cache','INSERT') AS v`))[0].v;
check("anon não tem INSERT", privAnon === false);

await db.exec(`GRANT SELECT, INSERT, UPDATE ON public.geocode_cache TO service_role`);
await q(`SET ROLE authenticated`);
const errLeitura = await tryQ(`SELECT count(*) FROM public.geocode_cache`);
await q(`RESET ROLE`);
check("cliente autenticado não consegue ler o cache", errLeitura !== null);

await q(`INSERT INTO public.geocode_cache (address_key, address, latitude, longitude)
         VALUES ('rua a lisboa', 'Rua A, Lisboa', 38.7223, -9.1393)`);
const linha = (await q(`SELECT latitude, longitude FROM public.geocode_cache WHERE address_key = 'rua a lisboa'`))[0];
check("grava e lê coordenadas", Number(linha.latitude) === 38.7223 && Number(linha.longitude) === -9.1393);

const dup = await tryQ(`INSERT INTO public.geocode_cache (address_key, address, latitude, longitude)
                        VALUES ('rua a lisboa', 'outro', 0, 0)`);
check("chave do endereço é única (não duplica)", dup !== null);

const semCoord = await tryQ(`INSERT INTO public.geocode_cache (address_key, address, latitude, longitude)
                             VALUES ('x', 'x', NULL, 0)`);
check("latitude é obrigatória", semCoord !== null);

const up = await tryQ(`INSERT INTO public.geocode_cache (address_key, address, latitude, longitude)
                       VALUES ('rua a lisboa', 'Rua A, Lisboa', 38.8, -9.2)
                       ON CONFLICT (address_key) DO UPDATE SET latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude`);
check("upsert por chave funciona (usado pelo geocoder)", up === null);

const criado = (await q(`SELECT created_at IS NOT NULL AS v FROM public.geocode_cache LIMIT 1`))[0].v;
check("created_at preenchido por omissão", criado === true);

console.log(failures() === 0 ? "\nTodos os testes passaram." : `\n${failures()} falha(s).`);
process.exit(failures() === 0 ? 0 : 1);
