import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { escapeHtml } from "../_shared/escapeHtml.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface WelcomeRequest {
  customerName: string;
  customerEmail: string;
}

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
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // Require a valid JWT, and only allow sending a welcome email to the caller's own address.
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const token = authHeader.slice(7).trim();
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user?.email) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { customerName, customerEmail }: WelcomeRequest = await req.json();

    // Prevent abuse: only allow sending to the caller's own email address.
    if (!customerEmail || customerEmail.toLowerCase() !== userData.user.email.toLowerCase()) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const safeName = escapeHtml(customerName || "");
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #1a1a1a;">Bem-vindo(a), ${safeName}!</h2>
        <p>A sua conta na <strong>confiancamanutencao.com app</strong> foi criada com sucesso.</p>
        <p>Agora pode agendar reparações de eletrodomésticos de forma rápida e prática.</p>
        <p>Por favor, confirme o seu email clicando no link de verificação que recebeu.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="color: #666;">Se tiver alguma dúvida, entre em contacto connosco através deste email.</p>
        <p style="margin-top: 30px; color: #999; font-size: 12px;">confiancamanutencao.com app</p>
      </div>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "confiancamanutencao.com app <info@confiancarepara.com>",
        to: [customerEmail],
        subject: "Bem-vindo(a) à confiancamanutencao.com app!",
        html,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.warn(`Resend API warning [${res.status}]: ${JSON.stringify(data)}`);
      return new Response(
        JSON.stringify({ success: false, warning: "Email not sent" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error sending welcome email:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
