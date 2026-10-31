// Login real no navegador (celular), contra o Supabase local, com as contas de teste do seed.
// Uso: o runner (scripts/testar-tudo.mjs) gera o build e passa APP_URL. Não toca em produção.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DIST = process.env.E2E_DIST || path.join(ROOT, ".test-results/dist-e2e");
const PORT = Number(process.env.E2E_PORT || 4173);
const SHOTS = path.join(ROOT, ".test-results/e2e-shots");
const PASSWORD = "Teste@12345";
fs.mkdirSync(SHOTS, { recursive: true });

// servidor estático com fallback de SPA
const mime = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json", ".woff2": "font/woff2" };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split("?")[0]);
  let f = path.join(DIST, u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, "index.html");
  res.writeHead(200, { "content-type": mime[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(PORT, r));
const BASE = `http://localhost:${PORT}`;

let fails = 0;
const check = (name, cond, extra = "") => { console.log((cond ? "PASS " : "FAIL ") + name + (extra ? " — " + extra : "")); if (!cond) fails++; };
const browser = await chromium.launch({ headless: true });
const VIEWPORT = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 };

// Cada login abre um navegador NOVO (sem sessão guardada). Senão a página /auth
// redireciona direto para o painel do login anterior.
async function login(email, password) {
  const ctx = await browser.newContext(VIEWPORT);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(`${BASE}/auth`, { waitUntil: "networkidle" });
  await page.waitForSelector("input#password", { timeout: 30000 });
  const form = page.locator("form", { has: page.locator("input#password") }).first();
  await form.locator("input#email").fill(email);
  await form.locator("input#password").fill(password);
  await form.locator("button[type='submit']").click();
  return { page, errors, ctx };
}

const ROLES = [
  { email: "cliente@teste.local", expect: "/dashboard", text: /Meus Serviços|Pendentes/, shot: "cliente" },
  { email: "empresa@teste.local", expect: "/empresa", shot: "empresa" },
  { email: "gestor@teste.local", expect: "/admin", shot: "gestor" },
  { email: "tecnico@teste.local", expect: "/dashboard", shot: "tecnico" },
];

for (const r of ROLES) {
  const { page, errors, ctx } = await login(r.email, PASSWORD);
  try {
    await page.waitForURL(u => !u.pathname.startsWith("/auth"), { timeout: 30000 });
    await page.waitForTimeout(2500);
    const urlPath = new URL(page.url()).pathname;
    if (r.expect) check(`${r.email} entra e cai em ${r.expect}`, urlPath.startsWith(r.expect), `url=${urlPath}`);
    else check(`${r.email} entra e chega em uma área logada`, urlPath !== "/auth", `url=${urlPath}`);
    if (r.text) check(`${r.email} vê o painel`, r.text.test(await page.innerText("body")));
    await page.screenshot({ path: path.join(SHOTS, `login-${r.shot}.png`) });
  } catch (e) {
    check(`${r.email} entra no sistema`, false, e.message.split("\n")[0]);
  }
  check(`${r.email}: sem erro de JavaScript na página`, errors.length === 0, errors.slice(0, 2).join(" | "));
  await ctx.close();
}

// senha errada: deve ficar na tela de login e mostrar erro
{
  const { page, ctx } = await login("cliente@teste.local", "senha-errada-123");
  await page.waitForTimeout(3000);
  const stillAuth = new URL(page.url()).pathname.startsWith("/auth");
  check("senha errada NÃO entra (fica em /auth)", stillAuth);
  await ctx.close();
}

await browser.close();
server.close();
console.log(fails ? `\n${fails} FALHA(S) no login` : "\nLOGIN: TODOS PASSARAM");
process.exit(fails ? 1 : 0);
