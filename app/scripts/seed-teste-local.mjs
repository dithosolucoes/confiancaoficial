// Cria contas e uma empresa de TESTE no Supabase LOCAL (dados fictícios).
// Uso: SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-teste-local.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (veja 'npx supabase status').");
  process.exit(1);
}
if (!/127\.0\.0\.1|localhost/.test(url)) {
  console.error("Recusado: este script só roda contra o Supabase local.");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const PASSWORD = "Teste@12345";
const COMPANY_ID = "11111111-1111-4111-8111-111111111111";

const { error: companyErr } = await admin.from("companies").upsert({
  id: COMPANY_ID,
  name: "Empresa de Teste (local)",
  nif: "999999990",
  is_approved: true,
}, { onConflict: "id" });
if (companyErr) { console.error("Empresa:", companyErr.message); process.exit(1); }

const accounts = [
  { role: "gestor",       email: "gestor@teste.local",   user_type: "gestor",        company: false },
  { role: "empresa",      email: "empresa@teste.local",  user_type: "company_admin", company: true  },
  { role: "tecnico",      email: "tecnico@teste.local",  user_type: "technician",    company: false },
  { role: "cliente",      email: "cliente@teste.local",  user_type: "customer",      company: false },
];

for (const acc of accounts) {
  let userId;
  const { data, error } = await admin.auth.admin.createUser({
    email: acc.email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { user_type: acc.user_type, full_name: `Teste ${acc.role}` },
    app_metadata: { role: acc.user_type === "gestor" ? "gestor" : undefined },
  });
  if (error && /already|registered|exists/i.test(error.message)) {
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    userId = list?.users?.find((u) => u.email === acc.email)?.id;
  } else if (error) {
    console.error(`${acc.email}:`, error.message); continue;
  } else {
    userId = data.user.id;
  }
  if (!userId) { console.error(`${acc.email}: não encontrado`); continue; }

  const { error: pErr } = await admin.from("profiles").upsert({
    user_id: userId,
    user_type: acc.user_type,
    company_id: acc.company ? COMPANY_ID : null,
    full_name: `Teste ${acc.role}`,
    email: acc.email,
  }, { onConflict: "user_id" });
  if (pErr) { console.error(`perfil ${acc.email}:`, pErr.message); continue; }
  console.log(`OK  ${acc.role.padEnd(8)} ${acc.email}  senha: ${PASSWORD}`);
}
console.log("\nPronto. Empresa de teste criada e aprovada.");
