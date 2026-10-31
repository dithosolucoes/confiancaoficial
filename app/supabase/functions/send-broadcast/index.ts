import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { escapeHtml } from "../_shared/escapeHtml.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    return new Response(
      JSON.stringify({ error: "RESEND_API_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // ── Authentication: only gestors may trigger a broadcast ──
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const token = authHeader.slice(7).trim();
  const { data: userData, error: userErr } = await adminClient.auth.getUser(token);
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { data: isGestor } = await adminClient.rpc("is_gestor", { _user_id: userData.user.id });
  if (!isGestor) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { data: profiles, error: profilesError } = await adminClient
      .from("profiles")
      .select("user_id, full_name, user_type");

    if (profilesError || !profiles?.length) {
      return new Response(
        JSON.stringify({ error: "No users found", details: profilesError?.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results = [];

    for (const profile of profiles) {
      const { data: u } = await adminClient.auth.admin.getUserById(profile.user_id);
      if (!u?.user?.email) continue;

      const safeName = escapeHtml(profile.full_name || "Utilizador");
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a1a1a;">Atualização da Aplicação 🔄</h2>
          <p>Olá, ${safeName}!</p>
          <p>Informamos que a aplicação <strong>Confiança Reparações</strong> foi atualizada com melhorias e novas funcionalidades.</p>
          <div style="background: #f0f7ff; border-left: 4px solid #2563eb; border-radius: 4px; padding: 16px; margin: 20px 0;">
            <p style="margin: 0; font-weight: bold;">Para garantir que tem acesso à versão mais recente:</p>
            <ul style="margin: 10px 0 0 0; padding-left: 20px;">
              <li>No telemóvel: feche completamente o browser e reabra a aplicação</li>
              <li>Ou aceda em janela anónima/privada</li>
              <li>Ou limpe o cache do browser (Definições → Limpar dados de navegação)</li>
            </ul>
          </div>
          <p>Se tiver a aplicação instalada no ecrã inicial, poderá ser necessário desinstalar e reinstalar para receber a atualização.</p>
          <p style="color: #333;">Obrigado por utilizar o nosso serviço!</p>
          <p style="margin-top: 30px; color: #999; font-size: 12px;">Confiança Reparações</p>
        </div>
      `;

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "Confiança Reparações <info@confiancarepara.com>",
          to: [u.user.email],
          subject: "Atualização da Aplicação – Confiança Reparações",
          html,
        }),
      });

      const data = await res.json();
      results.push({
        name: profile.full_name,
        email: u.user.email,
        type: profile.user_type,
        success: res.ok,
        ...(res.ok ? {} : { warning: data }),
      });
    }

    return new Response(JSON.stringify({ success: true, sent: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Broadcast error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
