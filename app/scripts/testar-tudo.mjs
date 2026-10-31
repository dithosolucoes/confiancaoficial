#!/usr/bin/env node
// Roda TODOS os testes do projeto, na ordem, e mostra um resumo no fim.
//
//   node scripts/testar-tudo.mjs               tudo (precisa do Docker + Supabase local para as partes de banco)
//   node scripts/testar-tudo.mjs --rapido      pula o build de produção
//   node scripts/testar-tudo.mjs --sem-e2e     pula o teste de navegador (login)
//
// Não grava nada em produção. Os testes de banco só rodam contra 127.0.0.1.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, ".test-results");
fs.mkdirSync(OUT, { recursive: true });
const flags = new Set(process.argv.slice(2));
const RAPIDO = flags.has("--rapido");
const SEM_E2E = flags.has("--sem-e2e");

const results = [];
const record = (name, status, detail = "") => {
  results.push({ name, status, detail });
  const icon = { PASS: "✔", FAIL: "✘", SKIP: "–" }[status];
  console.log(`\n${icon} ${status}  ${name}${detail ? "  (" + detail + ")" : ""}\n`);
};
const sh = (cmd, { quiet = false, env = {} } = {}) => {
  const r = spawnSync(cmd, {
    cwd: ROOT, shell: true, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, ...env }, stdio: quiet ? "pipe" : "inherit",
  });
  return { code: r.status ?? 1, out: (r.stdout || "") + (r.stderr || "") };
};
const step = (name, cmd, opts) => {
  console.log(`\n=== ${name} ===`);
  const r = sh(cmd, opts);
  record(name, r.code === 0 ? "PASS" : "FAIL", r.code === 0 ? "" : "veja o erro acima");
  return r;
};
const skip = (name, why) => record(name, "SKIP", why);

// 0) Node
const major = Number(process.versions.node.split(".")[0]);
if (major >= 20) record(`Node ${process.versions.node}`, "PASS");
else record(`Node ${process.versions.node}`, "FAIL", "precisa de Node 20 ou mais novo");

// 1) dependências
if (!fs.existsSync(path.join(ROOT, "node_modules"))) step("Instalar dependências (npm ci)", "npm ci --no-audit --no-fund");
else record("Dependências instaladas", "PASS", "node_modules já existe");

// 2) código
step("Tipos TypeScript (tsc)", "npx tsc -p tsconfig.app.json --noEmit");
step("Testes unitários (Vitest)", "npx vitest run");

// 3) SQL offline (Postgres em memória, não precisa de Docker)
const offline = fs.readdirSync(path.join(ROOT, "tests/sql/offline")).filter(f => f.endsWith(".test.mjs")).sort();
for (const f of offline) step(`SQL offline: ${f.replace(".test.mjs", "")}`, `node tests/sql/offline/${f}`);

// 4) build de produção
if (RAPIDO) skip("Build de produção", "pulado com --rapido");
else step("Build de produção (vite build)", "npx vite build");

// 5) Supabase local (Docker)
const docker = sh("docker info", { quiet: true });
let sb = null;
if (docker.code !== 0) {
  skip("Banco local (Supabase/Docker)", "Docker não está rodando: abra o Docker Desktop e rode 'npx supabase start'");
} else {
  const st = sh("npx supabase status -o env", { quiet: true });
  if (st.code === 0) {
    sb = {};
    for (const line of st.out.split(/\r?\n/)) {
      const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
      if (m) sb[m[1]] = m[2];
    }
    if (!sb.API_URL || !sb.DB_URL) sb = null;
  }
  if (!sb) skip("Banco local (Supabase/Docker)", "Supabase local não está no ar: rode 'npx supabase start'");
}

if (sb) {
  // 5a) banco real: migrações, funções, gatilhos, políticas, bucket
  const env = { DATABASE_URL: sb.DB_URL };
  const r = sh("node tests/sql/real-db.test.mjs", { env });
  console.log(r.code === 0 ? "" : r.out);
  record("Banco real: migrações, funções, gatilhos e políticas", r.code === 0 ? "PASS" : "FAIL", r.code === 0 ? "" : "veja as linhas FAIL acima");

  // 5b) contas de teste (idempotente)
  step("Criar contas de teste no Supabase local", "node scripts/seed-teste-local.mjs", {
    env: { SUPABASE_URL: sb.API_URL, SUPABASE_SERVICE_ROLE_KEY: sb.SERVICE_ROLE_KEY },
  });

  // 5c) navegador: login real com as contas de teste
  if (SEM_E2E) skip("Navegador: login real", "pulado com --sem-e2e");
  else {
    const b = step("Build para o navegador (apontando para o Supabase local)", "npx vite build --outDir .test-results/dist-e2e --emptyOutDir", {
      env: { VITE_SUPABASE_URL: sb.API_URL, VITE_SUPABASE_PUBLISHABLE_KEY: sb.ANON_KEY },
    });
    if (b.code === 0) {
      const e = sh("node tests/e2e/login.e2e.mjs", { quiet: true });
      console.log(e.out);
      if (/Executable doesn't exist|npx playwright install/i.test(e.out)) {
        skip("Navegador: login real", "falta o Chromium do Playwright: rode uma vez 'npx playwright install chromium'");
      } else {
        record("Navegador: login real (celular)", e.code === 0 ? "PASS" : "FAIL", e.code === 0 ? "" : "veja as linhas FAIL acima");
      }
    }
  }
}

// resumo
const count = s => results.filter(r => r.status === s).length;
const linhas = [
  "",
  "══════════════════════════════════════════════",
  ` RESUMO: ${count("PASS")} passou · ${count("FAIL")} falhou · ${count("SKIP")} pulado`,
  "══════════════════════════════════════════════",
  ...results.map(r => ` ${r.status.padEnd(4)} ${r.name}${r.detail ? "  — " + r.detail : ""}`),
  "",
];
const texto = linhas.join("\n");
console.log(texto);
fs.writeFileSync(path.join(OUT, "relatorio.txt"), texto, "utf8");
console.log(`Relatório salvo em: ${path.join(OUT, "relatorio.txt")}`);
process.exit(count("FAIL") ? 1 : 0);
