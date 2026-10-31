import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { escapeHtml as esc } from "../_shared/escapeHtml.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface NotificationRequest {
  type: "service_created" | "technician_confirmed" | "service_available" | "service_assigned" | "service_status_update";
  customerId?: string;
  customerName?: string;
  customerEmail?: string;
  technicianId?: string;
  applianceType: string;
  scheduledDate?: string;
  scheduledTime?: string;
  address?: string;
  reference?: string;
  statusMessage?: string;
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
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // ── Authentication: require a valid Supabase JWT from the caller ──
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return new Response(
      JSON.stringify({ error: "Unauthorized: missing bearer token" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  const token = authHeader.slice(7).trim();
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData } = await userClient.auth.getUser();
  const callerUserId = userData?.user?.id ?? null;
  const isServiceRole = token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!callerUserId && !isServiceRole) {
    return new Response(
      JSON.stringify({ error: "Unauthorized: invalid token" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  let callerIsGestor = false;
  if (callerUserId) {
    const { data: g } = await adminClient.rpc("is_gestor", { _user_id: callerUserId });
    callerIsGestor = !!g;
  }



  const sendEmail = async (to: string, subject: string, html: string) => {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Confiança Reparações <info@confiancarepara.com>",
        to: [to],
        subject,
        html,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.warn(`Resend API warning [${res.status}]: ${JSON.stringify(data)}`);
      return { success: false, warning: "Email not sent" };
    }
    return { success: true };
  };

  // Helper: create in-app notification for a technician
  const createInAppNotification = async (technicianId: string, title: string, message: string, type: string, serviceRequestId?: string) => {
    const insertData: Record<string, unknown> = {
      technician_id: technicianId,
      title,
      message,
      type,
    };
    if (serviceRequestId) insertData.service_request_id = serviceRequestId;
    
    const { error } = await adminClient.from("technician_notifications").insert(insertData);
    if (error) console.warn("Failed to create in-app notification:", error.message);
  };

  try {
    const payload: NotificationRequest = await req.json();
    const { type, customerId, customerName, customerEmail, technicianId, applianceType, scheduledDate, scheduledTime, address, reference, statusMessage } = payload;

    // Authorization matrix:
    //  - technician-broadcast types (service_available, service_assigned,
    //    service_status_update) require gestor role or the service-role key.
    //  - customer notifications (service_created, technician_confirmed) require
    //    the caller to be the customer themself or a gestor / service role.
    const isTechBroadcast =
      type === "service_available" ||
      type === "service_assigned" ||
      type === "service_status_update";
    if (isTechBroadcast && !callerIsGestor && !isServiceRole) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!isTechBroadcast && !isServiceRole && !callerIsGestor) {
      const targetUserId = customerId ?? callerUserId;
      if (!callerUserId || targetUserId !== callerUserId) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // For tech-broadcast types we source content from the DB (via reference)
    // when possible. We still accept the appliance type from the request body
    // because gestors are trusted callers, but it is escaped before use.
    const safeAppliance = esc(applianceType);
    const safeScheduledDate = esc(scheduledDate);
    const safeScheduledTime = esc(scheduledTime);
    const safeAddress = esc(address);
    const safeReference = esc(reference);
    const safeStatusMessage = esc(statusMessage);
    const safeCustomerName = esc(customerName);

    // ── Notify ALL active technicians: only appliance info ──
    if (type === "service_available") {
      const { data: technicians } = await adminClient
        .from("profiles")
        .select("user_id, full_name")
        .eq("user_type", "technician")
        .eq("is_paused", false);

      if (!technicians?.length) {
        return new Response(JSON.stringify({ success: false, warning: "No active technicians" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const results = [];
      for (const tech of technicians) {
        await createInAppNotification(
          tech.user_id,
          "Serviço Disponível",
          `Novo serviço disponível: ${applianceType}`,
          "service_available"
        );

        const { data: u } = await adminClient.auth.admin.getUserById(tech.user_id);
        if (!u?.user?.email) continue;

        const html = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #1a1a1a;">Serviço Disponível! 🔧</h2>
            <p>Olá, ${esc(tech.full_name)}!</p>
            <p>Existe um novo serviço disponível para reparação:</p>
            <div style="background: #f9f9f9; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <p style="font-size: 18px; font-weight: bold; margin: 0;">🔹 ${safeAppliance}</p>
            </div>
            <p style="color: #333;">Aceda à sua conta para ver os detalhes e aceitar este serviço.</p>
            <p style="margin-top: 30px; color: #999; font-size: 12px;">Confiança Reparações</p>
          </div>
        `;

        const result = await sendEmail(u.user.email, "Serviço Disponível – Confiança Reparações", html);
        results.push({ technician: tech.full_name, ...result });
      }

      return new Response(JSON.stringify({ success: true, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Notify a SPECIFIC assigned technician: full details ──
    if (type === "service_assigned" && technicianId) {
      const { data: techProfile } = await adminClient
        .from("profiles")
        .select("full_name")
        .eq("user_id", technicianId)
        .single();

      const techName = techProfile?.full_name || "Técnico";

      await createInAppNotification(
        technicianId,
        "Serviço Atribuído",
        `Foi-lhe atribuído: ${applianceType}${reference ? ` (Ref: ${reference})` : ""}${scheduledDate ? ` – ${scheduledDate}` : ""}${scheduledTime ? ` às ${scheduledTime}` : ""}`,
        "service_assigned"
      );

      const { data: u } = await adminClient.auth.admin.getUserById(technicianId);
      if (!u?.user?.email) {
        return new Response(JSON.stringify({ success: false, warning: "Technician email not found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const refLine = reference ? `<tr><td style="padding: 8px; font-weight: bold;">Referência:</td><td style="padding: 8px;">${safeReference}</td></tr>` : "";

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a1a1a;">Serviço Atribuído! 🔧</h2>
          <p>Olá, ${esc(techName)}!</p>
          <p>Foi-lhe atribuído um novo serviço. Consulte os detalhes:</p>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background: #f9f9f9; border-radius: 8px;">
            ${refLine}
            <tr><td style="padding: 8px; font-weight: bold;">Eletrodoméstico:</td><td style="padding: 8px;">${safeAppliance}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Data:</td><td style="padding: 8px;">${safeScheduledDate || "—"}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Horário:</td><td style="padding: 8px;">${safeScheduledTime || "—"}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Morada:</td><td style="padding: 8px;">${safeAddress || "—"}</td></tr>
          </table>
          <p style="color: #333;">Aceda à sua conta para confirmar este serviço.</p>
          <p style="margin-top: 30px; color: #999; font-size: 12px;">Confiança Reparações</p>
        </div>
      `;

      const result = await sendEmail(u.user.email, "Serviço Atribuído – Confiança Reparações", html);

      const { data: allTechs } = await adminClient
        .from("profiles")
        .select("user_id, full_name")
        .eq("user_type", "technician")
        .eq("is_paused", false)
        .eq("is_approved", true);

      const broadcastResults: any[] = [];
      for (const tech of allTechs || []) {
        if (tech.user_id === technicianId) continue;

        await createInAppNotification(
          tech.user_id,
          "Serviço Disponível",
          `Novo serviço disponível: ${applianceType}`,
          "service_available"
        );

        const { data: uu } = await adminClient.auth.admin.getUserById(tech.user_id);
        if (!uu?.user?.email) continue;

        const broadcastHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #1a1a1a;">Novo Serviço Disponível 🔧</h2>
            <p>Olá, ${esc(tech.full_name)}!</p>
            <p>Existe um novo serviço disponível na aplicação. Aceda à sua conta para ver os detalhes e aceitar.</p>
            <div style="background: #f9f9f9; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <p style="font-size: 18px; font-weight: bold; margin: 0;">🔹 ${safeAppliance}</p>
            </div>
            <p style="margin-top: 30px; color: #999; font-size: 12px;">Confiança Reparações</p>
          </div>
        `;
        const r = await sendEmail(uu.user.email, "Novo Serviço Disponível – Confiança Reparações", broadcastHtml);
        broadcastResults.push({ technician: tech.full_name, ...r });
      }

      return new Response(JSON.stringify({ ...result, broadcast: broadcastResults }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (type === "service_status_update" && technicianId) {
      await createInAppNotification(
        technicianId,
        "Atualização de Serviço",
        statusMessage || `O serviço ${applianceType} foi atualizado.`,
        "status_update"
      );

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Customer notifications ──
    let email = customerEmail;
    if (!email && customerId) {
      const { data: u, error: userError } = await adminClient.auth.admin.getUserById(customerId);
      if (userError || !u?.user?.email) throw new Error("Could not retrieve customer email");
      email = u.user.email;
    }
    if (!email) throw new Error("No email provided or resolved");

    let subject: string;
    let html: string;

    if (type === "service_created") {
      subject = "Serviço Agendado – Confiança Reparações";
      html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a1a1a;">Olá, ${safeCustomerName}!</h2>
          <p>O seu pedido de serviço foi agendado com sucesso.</p>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr><td style="padding: 8px; font-weight: bold;">Eletrodoméstico:</td><td style="padding: 8px;">${safeAppliance}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Data:</td><td style="padding: 8px;">${safeScheduledDate}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Horário:</td><td style="padding: 8px;">${safeScheduledTime}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Morada:</td><td style="padding: 8px;">${safeAddress}</td></tr>
          </table>
          <p style="color: #666;">O técnico estará no local numa janela de até 2 horas a partir do horário agendado.</p>
          <p>Aguarde a confirmação do técnico.</p>
          <p style="margin-top: 30px; color: #999; font-size: 12px;">Confiança Reparações</p>
        </div>
      `;
    } else {
      subject = "Técnico Confirmado – Confiança Reparações";
      html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a1a1a;">Olá, ${safeCustomerName}!</h2>
          <p>Um técnico confirmou o seu pedido de serviço.</p>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr><td style="padding: 8px; font-weight: bold;">Eletrodoméstico:</td><td style="padding: 8px;">${safeAppliance}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Data:</td><td style="padding: 8px;">${safeScheduledDate}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Horário:</td><td style="padding: 8px;">${safeScheduledTime}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Morada:</td><td style="padding: 8px;">${safeAddress}</td></tr>
          </table>
          <p style="color: #666;">O técnico estará no local numa janela de até 2 horas a partir do horário agendado.</p>
          <p style="margin-top: 30px; color: #999; font-size: 12px;">Confiança Reparações</p>
        </div>
      `;
    }

    const result = await sendEmail(email, subject, html);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error sending email:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

