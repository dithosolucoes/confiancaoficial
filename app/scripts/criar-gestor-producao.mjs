// Cria (ou promove) um usuário gestor no Supabase de produção.
// Uso (no cmd, na pasta do projeto):
//   set SUPABASE_URL=https://SEU-PROJETO.supabase.co
//   set SUPABASE_SERVICE_ROLE_KEY=COLE_A_CHAVE_SERVICE_ROLE
//   node scripts\criar-gestor-producao.mjs seu@email.com
// A senha é digitada escondida. A chave service_role nunca vai para o código.

import readline from "node:readline";

const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const email = (process.argv[2] || "").trim().toLowerCase();

if (!url.startsWith("https://") || !url.includes("supabase.co")) {
  console.error("Defina SUPABASE_URL com a URL https do projeto (xxxx.supabase.co).");
  process.exit(1);
}
if (!key) {
  console.error("Defina SUPABASE_SERVICE_ROLE_KEY antes de rodar.");
  process.exit(1);
}
if (!/^\S+@\S+\.\S+$/.test(email)) {
  console.error("Informe o e-mail: node scripts\\criar-gestor-producao.mjs seu@email.com");
  process.exit(1);
}

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => {
        if (s.includes(question)) rl.output.write(s);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
};

async function main() {
  const password = await ask("Senha do gestor (mín. 8 caracteres): ", { hidden: true });
  if (password.length < 8) {
    console.error("A senha precisa ter pelo menos 8 caracteres.");
    process.exit(1);
  }

  // 1) Cria o usuário já confirmado. Se já existir, busca o existente.
  let userId;
  const create = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (create.ok) {
    userId = (await create.json()).id;
    console.log("Usuário criado.");
  } else {
    const list = await fetch(`${url}/auth/v1/admin/users?per_page=1000`, { headers });
    const data = await list.json();
    const found = (data.users || []).find((u) => (u.email || "").toLowerCase() === email);
    if (!found) {
      console.error("Falha ao criar o usuário:", await create.text());
      process.exit(1);
    }
    userId = found.id;
    // Atualiza a senha do usuário que já existia.
    await fetch(`${url}/auth/v1/admin/users/${userId}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ password, email_confirm: true }),
    });
    console.log("Usuário já existia: senha atualizada.");
  }

  // 2) Garante o perfil como gestor (o perfil é criado automaticamente pelo cadastro).
  const profile = await fetch(`${url}/rest/v1/profiles?user_id=eq.${userId}`, {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify({ user_type: "gestor" }),
  });
  const rows = profile.ok ? await profile.json() : [];
  if (!profile.ok || rows.length === 0) {
    console.error("Usuário criado, mas o perfil não foi atualizado:", await profile.text());
    process.exit(1);
  }
  console.log(`Pronto: ${email} agora é gestor. Pode entrar pelo site.`);
}

main().catch((e) => {
  console.error("Erro:", e);
  process.exit(1);
});
