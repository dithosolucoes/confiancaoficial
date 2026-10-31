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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // 1) Quem chama precisa estar autenticado
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller } } = await admin.auth.getUser(token);
    if (!caller) return json({ error: "Não autenticado." }, 401);

    // 2) Perfil de quem chama: gestor, ou empresa_admin da própria empresa
    const { data: callerProfile } = await admin
      .from("profiles")
      .select("user_type, company_id")
      .eq("user_id", caller.id)
      .maybeSingle();

    const body = await req.json();
    const companyId: string | undefined = body.company_id;
    const fullName: string = (body.full_name ?? "").trim();
    const phone: string = (body.phone ?? "").trim();
    const email: string = (body.email ?? "").trim().toLowerCase();
    const address: string | null = (body.address ?? "").trim() || null;
    const rawRedirect: string = (body.redirect_to ?? "").trim();
    const redirectTo = rawRedirect.startsWith("http") ? rawRedirect : undefined;

    if (!callerProfile || !companyId) {
      return json({ error: "Empresa não informada." }, 400);
    }

    const isGestor = callerProfile.user_type === "gestor";
    const isOwnCompanyAdmin =
      callerProfile.user_type === "company_admin" && callerProfile.company_id === companyId;
    if (!isGestor && !isOwnCompanyAdmin) {
      return json({ error: "Sem permissão para cadastrar técnicos nesta empresa." }, 403);
    }

    // 3) Validação dos dados
    if (!fullName) return json({ error: "Nome é obrigatório." }, 400);
    if (!phone) return json({ error: "Telefone é obrigatório." }, 400);
    if (!email || !email.includes("@")) return json({ error: "E-mail válido é obrigatório para o login do técnico." }, 400);

    // 4) Cria a conta e envia convite por e-mail (o técnico define a própria senha)
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: {
        full_name: fullName,
        user_type: "technician",
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

    // 5) Completa o perfil criado pelo trigger com os dados da equipa
    const { error: profileError } = await admin
      .from("profiles")
      .update({
        full_name: fullName,
        phone,
        email,
        address,
        user_type: "technician",
        company_id: companyId,
        is_approved: true,
        is_partner: true,
      })
      .eq("user_id", invited.user.id);
    if (profileError) {
      return json({ error: profileError.message }, 500);
    }

    return json({ success: true, user_id: invited.user.id });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
