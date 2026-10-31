import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { escapeHtml } from "../_shared/escapeHtml.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Authentication: either the service role key (called from the verified
    // Stripe webhook server-side) OR an authenticated gestor user.
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.slice(7).trim();
    const isServiceRole = token === SERVICE_KEY;
    if (!isServiceRole) {
      const { data: userData, error: userErr } = await admin.auth.getUser(token);
      if (userErr || !userData?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: isGestor } = await admin.rpc("is_gestor", { _user_id: userData.user.id });
      if (!isGestor) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { service_request_id, payment_type } = await req.json();
    if (!service_request_id) throw new Error("service_request_id required");

    const { data: service } = await admin
      .from("service_requests")
      .select("*")
      .eq("id", service_request_id)
      .single();
    if (!service?.technician_id) {
      return new Response(JSON.stringify({ skipped: "no technician" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isMaterials = payment_type === "materials";
    const label = isMaterials ? "Peças" : "Mão de Obra";
    const title = `Pagamento Confirmado (${label})`;
    const message = `O cliente concluiu o pagamento de ${label.toLowerCase()} do serviço ${service.reference || ""}.`;

    await admin.from("technician_notifications").insert({
      technician_id: service.technician_id,
      title,
      message,
      type: "payment_confirmed",
      service_request_id,
    });

    if (RESEND_API_KEY) {
      const { data: u } = await admin.auth.admin.getUserById(service.technician_id);
      const email = u?.user?.email;
      if (email) {
        const safeRef = escapeHtml(service.reference || "—");
        const safeAppliance = escapeHtml(service.appliance_type || "—");
        const html = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color:#1a1a1a;">Pagamento Confirmado ✅</h2>
            <p>O cliente concluiu o pagamento de <strong>${escapeHtml(label)}</strong>.</p>
            <table style="width:100%;border-collapse:collapse;background:#f9f9f9;border-radius:8px;margin:20px 0;">
              <tr><td style="padding:8px;font-weight:bold;">Referência:</td><td style="padding:8px;">${safeRef}</td></tr>
              <tr><td style="padding:8px;font-weight:bold;">Serviço:</td><td style="padding:8px;">${safeAppliance}</td></tr>
            </table>
            <p style="color:#999;font-size:12px;">Confiança Reparações</p>
          </div>`;
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
          body: JSON.stringify({
            from: "Confiança Reparações <info@confiancarepara.com>",
            to: [email],
            subject: `${title} – Confiança Reparações`,
            html,
          }),
        });
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
