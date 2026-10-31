// Ajuda comum dos testes SQL offline (PGlite = Postgres real, em memória, sem Docker).
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const migration = (name) => path.join(ROOT, "supabase/migrations", name);
export const readMigration = (name) => fs.readFileSync(migration(name), "utf8");

export function makeCheck() {
  let fails = 0;
  const check = (name, cond) => {
    console.log((cond ? "PASS " : "FAIL ") + name);
    if (!cond) fails++;
  };
  return { check, failures: () => fails };
}
