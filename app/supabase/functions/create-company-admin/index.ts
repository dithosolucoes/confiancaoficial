import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Cria o login da empresa parceira (papel company_admin) ligado à empresa,
// envia convite por e-mail e a empresa define a própria senha.
// Só o gestor pode usar esta função.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // 1) Quem chama precisa estar autenticado e ser gestor
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller } } = await admin.auth.getUser(token);
    if (!caller) return json({ error: "Não autenticado." }, 401);

    const { data: callerProfile } = await admin
      .from("profiles")
      .select("user_type")
      .eq("user_id", caller.id)
      .maybeSingle();
    if (callerProfile?.user_type !== "gestor") {
      return json({ error: "Apenas o gestor pode criar o acesso de uma empresa." }, 403);
    }

    // 2) Dados recebidos
    const body = await req.json();
    const companyId: string | undefined = body.company_id;
    const fullName: string = (body.full_name ?? "").trim();
    const email: string = (body.email ?? "").trim().toLowerCase();
    const rawRedirect: string = (body.redirect_to ?? "").trim();
    const redirectTo = rawRedirect.startsWith("http") ? rawRedirect : undefined;

    if (!companyId) return json({ error: "Empresa não informada." }, 400);
    if (!fullName) return json({ error: "Nome do responsável é obrigatório." }, 400);
    if (!email || !email.includes("@")) return json({ error: "E-mail válido é obrigatório." }, 400);

    // 3) A empresa precisa existir
    const { data: company } = await admin
      .from("companies")
      .select("id, name")
      .eq("id", companyId)
      .maybeSingle();
    if (!company) return json({ error: "Empresa não encontrada." }, 404);

    // 4) Cria a conta e envia convite por e-mail
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: {
        full_name: fullName,
        user_type: "company_admin",
        company_id: companyId,
      },
    });
    if (inviteError || !invited?.user) {
      const msg = inviteError?.message ?? "Não foi possível criar a conta.";
      const alreadyExists = /already|registered|exists/i.test(msg);
      return json(
        { error: alreadyExists ? "Já existe uma conta com este e-mail." : msg },
        alreadyExists ? 409 : 500
      );
    }

    // 5) Fixa o papel e o vínculo com a empresa (o trigger não aceita company_admin sozinho)
    const { error: profileError } = await admin
      .from("profiles")
      .update({
        full_name: fullName,
        email,
        user_type: "company_admin",
        company_id: companyId,
      })
      .eq("user_id", invited.user.id);
    if (profileError) {
      return json({ error: profileError.message }, 500);
    }

    return json({ success: true, user_id: invited.user.id, company: company.name });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
