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
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.slice(7).trim();
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { service_request_id, material_id } = await req.json();
    if (!service_request_id) throw new Error("service_request_id is required");

    const { data: service, error: sErr } = await admin
      .from("service_requests")
      .select("id, customer_id, technician_id, appliance_type, reference")
      .eq("id", service_request_id)
      .single();
    if (sErr || !service) throw new Error("Service not found");

    // Ownership check: caller must be the assigned technician or a gestor.
    const { data: isGestor } = await admin.rpc("is_gestor", { _user_id: userData.user.id });
    if (!isGestor && service.technician_id !== userData.user.id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Source material name/cost from the DB, not the request body, to prevent spoofing.
    let material_name = "";
    let customerPrice = 0;
    if (material_id) {
      const { data: mat } = await admin
        .from("service_materials")
        .select("material_name, material_cost, quantity")
        .eq("id", material_id)
        .eq("service_request_id", service_request_id)
        .single();
      if (mat) {
        material_name = mat.material_name || "";
        customerPrice = Number(mat.material_cost || 0) * Number(mat.quantity || 1);
      }
    } else {
      // Fall back to the most recent pending material for this service.
      const { data: mat } = await admin
        .from("service_materials")
        .select("material_name, material_cost, quantity")
        .eq("service_request_id", service_request_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (mat) {
        material_name = mat.material_name || "";
        customerPrice = Number(mat.material_cost || 0) * Number(mat.quantity || 1);
      }
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, email")
      .eq("user_id", service.customer_id)
      .single();

    let email = profile?.email || "";
    if (!email) {
      const { data: u } = await admin.auth.admin.getUserById(service.customer_id);
      email = u?.user?.email || "";
    }

    if (RESEND_API_KEY && email) {
      const safeName = escapeHtml(profile?.full_name || "Cliente");
      const safeRef = escapeHtml(service.reference || "");
      const safeAppliance = escapeHtml(service.appliance_type || "");
      const safeMaterial = escapeHtml(material_name || "-");
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a1a1a;">Nova Peça Adicionada – Confiança Manutenções</h2>
          <p>Olá, ${safeName}!</p>
          <p>O técnico adicionou uma peça ao seu serviço <strong>${safeRef}</strong> (${safeAppliance}).</p>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background: #f9f9f9; border-radius: 8px;">
            <tr><td style="padding: 8px;">Peça:</td><td style="padding: 8px; text-align:right;"><strong>${safeMaterial}</strong></td></tr>
            <tr><td style="padding: 8px;">Valor:</td><td style="padding: 8px; text-align:right;"><strong>€${customerPrice.toFixed(2)}</strong></td></tr>
          </table>
          <p>Para que o técnico avance com a substituição da peça, é necessário efetuar o pagamento através do link seguro abaixo.</p>
          <p style="text-align:center; margin: 24px 0;">
            <a href="https://buy.stripe.com/bJeaEZ1An3OedTd9HdcQU05" style="background:#635bff; color:#fff; padding:14px 28px; border-radius:8px; text-decoration:none; font-weight:bold; font-size:16px;">Pagar Agora (Stripe)</a>
          </p>
          <p style="text-align:center; font-size:12px; color:#666;">Também pode aceder à aplicação para visualizar o serviço:</p>
          <p style="text-align:center; margin: 8px 0 24px;">
            <a href="https://confiancamanutencao.com/dashboard" style="color:#1a1a1a; text-decoration:underline; font-size:13px;">Abrir Painel do Cliente</a>
          </p>
          <p style="margin-top: 30px; color: #999; font-size: 12px;">Confiança Manutenções</p>
        </div>
      `;
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({
          from: "Confiança Manutenções <info@confiancarepara.com>",
          to: [email],
          subject: `Nova peça para aprovação – ${service.reference || service.appliance_type}`,
          html,
        }),
      }).catch((e) => console.warn("Resend error:", e));
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error(msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
