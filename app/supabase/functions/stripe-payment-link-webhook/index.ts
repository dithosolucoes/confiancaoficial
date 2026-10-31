import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, stripe-signature",
};

/**
 * Stripe webhook for Payment Link (buy.stripe.com/...) checkout completions.
 *
 * When a customer pays through the booking Payment Link, Stripe sends
 * `checkout.session.completed`. We use `client_reference_id` (set by the
 * frontend when opening the link) to find the matching service_request and
 * promote it from `payment_pending` to `pending` (available for technicians).
 *
 * Setup in Stripe Dashboard:
 *   Developers → Webhooks → Add endpoint
 *   URL: https://<project>.supabase.co/functions/v1/stripe-payment-link-webhook
 *   Events: checkout.session.completed
 *   Copy the signing secret into STRIPE_WEBHOOK_SECRET.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
    const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const stripe = new Stripe(STRIPE_KEY, { apiVersion: "2025-08-27.basil" });
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const signature = req.headers.get("stripe-signature");
    const rawBody = await req.text();

    if (!WEBHOOK_SECRET) {
      console.error("ERRO CRÍTICO: STRIPE_WEBHOOK_SECRET não está configurado nas variáveis de ambiente.");
      return new Response(
        JSON.stringify({ error: "Webhook secret missing from server configuration" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!signature) {
      console.error("Requisição de webhook rejeitada: cabeçalho 'stripe-signature' ausente.");
      return new Response(
        JSON.stringify({ error: "Missing stripe-signature header" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        rawBody,
        signature,
        WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("Falha na verificação criptográfica da assinatura:", (err as Error).message);
      return new Response(
        JSON.stringify({ error: "Invalid signature" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (event.type !== "checkout.session.completed") {
      return new Response(JSON.stringify({ received: true, ignored: event.type }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Verificação de Idempotência: Se o evento já foi processado anteriormente, retornar 200 OK sem duplicar
    const eventId = event.id;
    try {
      const { data: existingEvent } = await admin
        .from("stripe_webhook_events")
        .select("id, event_id")
        .eq("event_id", eventId)
        .maybeSingle();

      if (existingEvent) {
        console.log(`Evento do Stripe já processado anteriormente (${eventId}). Retornando 200 OK (idempotente).`);
        return new Response(
          JSON.stringify({ received: true, already_processed: true, event_id: eventId }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } catch (_checkErr) {
      // Ignora erro se tabela não existir ainda em migrações pendentes
    }

    const session = event.data.object as Stripe.Checkout.Session;
    const paid = session.payment_status === "paid" || session.status === "complete";
    if (!paid) {
      return new Response(JSON.stringify({ received: true, not_paid: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawRef =
      session.client_reference_id ||
      (session.metadata?.service_request_id as string | undefined);

    if (!rawRef) {
      console.warn("Webhook received with no client_reference_id / service_request_id");
      return new Response(JSON.stringify({ received: true, no_reference: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // client_reference_id format: "<serviceId>|<paymentType>" (paymentType optional, defaults to booking)
    const [serviceId, paymentTypeRaw] = rawRef.split("|");
    const paymentType = (paymentTypeRaw || "booking").toLowerCase();

    const { data: svc, error: fetchErr } = await admin
      .from("service_requests")
      .select("id, reference, status, appliance_type, technician_id")
      .eq("id", serviceId)
      .maybeSingle();

    if (fetchErr || !svc) {
      console.error("service_request not found", serviceId, fetchErr);
      return new Response(JSON.stringify({ error: "service_request not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ponto único de confirmação: mesma função usada pelo modo simulado (create-payment).
    const validTypes = ["booking", "quote", "labor", "materials", "additional"];
    const typeToConfirm = validTypes.includes(paymentType) ? paymentType : "booking";
    const amountEur = Number(session.amount_total || 0) / 100;
    const { error: confirmErr } = await admin.rpc("confirmar_pagamento", {
      _service_id: serviceId,
      _payment_type: typeToConfirm,
      _amount: amountEur,
      _expected_amount: null,
      _method: "stripe_checkout",
      _source: "stripe",
      _reference: session.id,
      _actor: null,
    });
    if (confirmErr) {
      console.error("confirmar_pagamento failed", confirmErr);
      return new Response(JSON.stringify({ error: "could not confirm payment" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (typeToConfirm === "booking") {
      // Agendamento pago: se o serviço estava aguardando, avisa os técnicos.
      if (svc.status === "payment_pending" && !svc.technician_id) {
        try {
          await admin.functions.invoke("send-notification", {
            body: { type: "service_available", applianceType: svc.appliance_type },
          });
        } catch (e) {
          console.warn("send-notification failed", e);
        }
      }
    } else {
      try {
        await admin.functions.invoke("notify-technician-payment", {
          body: { service_request_id: serviceId, payment_type: typeToConfirm },
        });
      } catch (e) {
        console.warn("notify-technician-payment failed", e);
      }
    }

    // Gravar registro de idempotência para bloquear reprocessamentos duplicados
    try {
      await admin.from("stripe_webhook_events").insert({
        event_id: eventId,
        event_type: event.type,
        service_id: serviceId,
        payment_type: paymentType,
        session_id: session.id,
        created_at: new Date().toISOString(),
      });
    } catch (_insErr) {
      // Ignora erro se tabela não estiver provisionada ainda
    }

    return new Response(
      JSON.stringify({ received: true, service_id: serviceId, payment_type: paymentType, promoted: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("webhook error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
