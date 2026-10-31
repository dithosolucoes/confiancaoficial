import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { findCatalogVatRate, splitVat, bookingChargeFor, DEFAULT_VAT_RATE, type CatalogVatRow } from "../_shared/pricing.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw new Error("User not authenticated");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (!user?.email) throw new Error("User not authenticated");

    const { service_request_id, payment_type } = await req.json();
    if (!service_request_id) throw new Error("service_request_id is required");

    // Fetch service request
    const { data: service, error: serviceError } = await supabaseClient
      .from("service_requests")
      .select("*")
      .eq("id", service_request_id)
      .eq("customer_id", user.id)
      .single();

    if (serviceError || !service) throw new Error("Service request not found");
    if (!service.reference?.startsWith("CO")) throw new Error("Payment is only available for CO services");

    // Cliente de serviço: lê catálogo (IVA) e confirma pagamentos. Nunca exposto ao cliente.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    let amountInCents: number;
    let description: string;

    if (payment_type === "booking") {
      // Initial booking payment — fixed prices treated as TOTAL with VAT included.
      // The system no longer adds VAT on top of the entered amount; it decomposes
      // the inclusive total into base + VAT for display only.
      if (service.status !== "pending" && service.status !== "payment_pending") throw new Error("Service is not in pending/payment_pending status for booking payment");

      // IVA vem do catálogo (appliance_types.vat_rate), não de lista fixa neste código.
      const { data: catalogRows, error: catErr } = await admin
        .from("appliance_types")
        .select("name, vat_rate");
      if (catErr) throw new Error("Não foi possível ler o catálogo de IVA");
      const catalogVat = findCatalogVatRate(service.appliance_type, (catalogRows || []) as CatalogVatRow[]);
      if (catalogVat === null) {
        console.warn(`create-payment: tipo "${service.appliance_type}" sem IVA no catálogo; usando ${DEFAULT_VAT_RATE * 100}%`);
      }
      const vatRate = catalogVat ?? DEFAULT_VAT_RATE;
      const vatPct = Math.round(vatRate * 100);

      // Valor da visita: a taxa cadastrada no tipo de serviço (IVA incluído).
      // Sem taxa cadastrada, usa o padrão por aparelho (85 / 75 / 55), igual ao repasse.
      const totalWithVat = bookingChargeFor(service).total;
      // Garantia/retrabalho ou tipo sem visita cobrada: não há nada a pagar pela visita.
      if (totalWithVat <= 0) throw new Error("Este serviço não tem visita a pagar");
      const { base: baseWithoutVat, vat: vatAmount } = splitVat(totalWithVat, vatRate);
      amountInCents = Math.round(totalWithVat * 100);
      description = `Agendamento ${service.reference} - ${service.appliance_type} (Total ${totalWithVat.toFixed(2).replace('.', ',')}€ c/ IVA ${vatPct}% incluído: base ${baseWithoutVat.toFixed(2).replace('.', ',')}€ + IVA ${vatAmount.toFixed(2).replace('.', ',')}€)`;
    } else if (payment_type === "labor") {
      // Customer accepts technician's proposed labor cost
      // Total = labor + parts + extra_fee + materiais aprovados
      // IMPORTANT: rejected labor (labor_rejected_at set & not approved/paid) must NOT be charged
      const laborRejected = !!service.labor_rejected_at && !service.labor_approved_at && !service.labor_paid_at;
      const quoteParts = Number(service.quote_parts || 0);
      const laborCost = laborRejected ? 0 : Number(service.labor_cost || 0);
      const extraFee = Number(service.extra_fee || 0);

      // Incluir materiais (peças) propostos pelo técnico no mesmo pagamento
      const { data: mats, error: matErr } = await supabaseClient
        .from("service_materials")
        .select("material_cost, status")
        .eq("service_request_id", service_request_id);
      if (matErr) throw matErr;
      const billable = (mats || []).filter((m: any) => m.status !== "rejected");
      const partsMul = 1;
      const matsTotal = billable.reduce(
        (sum: number, m: any) => sum + Number(m.material_cost || 0) * partsMul,
        0
      );
      // Aprovação automática de quaisquer materiais pendentes
      if (billable.length > 0) {
        await supabaseClient
          .from("service_materials")
          .update({ status: "approved" })
          .eq("service_request_id", service_request_id)
          .eq("status", "pending");
      }

      const total = quoteParts + laborCost + extraFee + matsTotal;
      if (total <= 0) throw new Error("Proposed amount must be greater than zero");
      amountInCents = Math.round(total * 100);
      description = `Serviço ${service.reference} - ${service.appliance_type} (${laborRejected ? "Peças/Extras (MO rejeitada)" : "Orçamento completo"}${matsTotal > 0 ? " + peças" : ""})`;




    } else if (payment_type === "additional") {
      // Saldo adicional agrupado: M.O. + Taxa Extra + Materiais ainda não pagos.
      // Cada componente tem o seu marcador de pagamento — nunca cobrar duas vezes.
      const laborRejected = !!service.labor_rejected_at && !service.labor_approved_at && !service.labor_paid_at;
      const laborAlreadyPaid = !!service.labor_paid_at || !!service.quote_paid_at;
      const materialsAlreadyPaid = !!service.materials_paid_at;
      const quoteRejected = (service.quote_status || "") === "rejected";

      const laborPart = laborAlreadyPaid || laborRejected || quoteRejected ? 0 : Number(service.labor_cost || 0);
      const extraPart = laborAlreadyPaid || quoteRejected || service.is_warranty ? 0 : Number(service.extra_fee || 0);

      let matsPart = 0;
      if (!materialsAlreadyPaid && !quoteRejected) {
        const { data: mats, error: matErr } = await supabaseClient
          .from("service_materials")
          .select("material_cost, quantity, status")
          .eq("service_request_id", service_request_id);
        if (matErr) throw matErr;
        matsPart = (mats || [])
          .filter((m: any) => (m.status || "") !== "rejected")
          .reduce((sum: number, m: any) => sum + Number(m.material_cost || 0) * (Number(m.quantity) || 1), 0);
      }

      const total = laborPart + extraPart + matsPart;
      if (total <= 0) throw new Error("Não existem valores adicionais pendentes para este serviço");
      amountInCents = Math.round(total * 100);
      const parts: string[] = [];
      if (laborPart > 0) parts.push("Mão de Obra");
      if (extraPart > 0) parts.push("Taxa Extra");
      if (matsPart > 0) parts.push("Materiais");
      description = `Serviço ${service.reference} - Valor adicional (${parts.join(" + ")})`;
    } else if (payment_type === "materials") {
      // Customer approves and pays for materials (parts) added by the technician
      const { data: mats, error: matErr } = await supabaseClient
        .from("service_materials")
        .select("material_cost, status")
        .eq("service_request_id", service_request_id);
      if (matErr) throw matErr;
      const billable = (mats || []).filter((m: any) => m.status !== "rejected");
      const partsMul = 1;
      const total = billable.reduce(
        (sum: number, m: any) => sum + Number(m.material_cost || 0) * partsMul,
        0
      );
      if (total <= 0) throw new Error("Material amount must be greater than zero");
      // Auto-approve any pending materials when customer initiates payment
      await supabaseClient
        .from("service_materials")
        .update({ status: "approved" })
        .eq("service_request_id", service_request_id)
        .eq("status", "pending");
      amountInCents = Math.round(total * 100);
      description = `Serviço ${service.reference} - ${service.appliance_type} (Peças)`;

    } else {
      // Quote payment (existing flow)
      if (service.status !== "quote_sent") throw new Error("Quote is not available for payment");
      
      const quoteParts = Number(service.quote_parts || 0);
      const laborCost = Number(service.labor_cost || 0);
      const total = quoteParts + laborCost;
      if (total <= 0) throw new Error("Quote total must be greater than zero");
      amountInCents = Math.round(total * 100);
      description = `Serviço ${service.reference} - ${service.appliance_type}`;

    }

    // Modo simulado (Stripe ainda não ligada): confirma pelo ponto único
    // (confirmar_pagamento) e não abre checkout. Muda para 'stripe' em platform_settings.
    const { data: modeRow } = await admin
      .from("platform_settings")
      .select("value")
      .eq("key", "payment_mode")
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle();
    const paymentMode = typeof modeRow?.value === "string" ? modeRow.value : "simulado";

    if (paymentMode === "simulado") {
      const simType = payment_type || "quote";
      const amountEur = amountInCents / 100;
      const { error: confirmErr } = await admin.rpc("confirmar_pagamento", {
        _service_id: service_request_id,
        _payment_type: simType,
        _amount: amountEur,
        _expected_amount: amountEur,
        _method: "simulado",
        _source: "simulado",
        _reference: `SIM-${Date.now()}`,
        _actor: user.id,
      });
      if (confirmErr) throw new Error(confirmErr.message);
      return new Response(JSON.stringify({ simulated: true, amount: amountEur }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId: string | undefined;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    }

    // client_reference_id carries "<serviceId>|<paymentType>" — this is the
    // ONLY field stripe-payment-link-webhook reads to tell payment types
    // apart (it falls back to metadata.service_request_id, which has no
    // payment type suffix, and silently defaults to "booking" otherwise).
    // Metadata is kept too, for visibility in the Stripe dashboard.
    const resolvedPaymentType = payment_type || "quote";
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      client_reference_id: `${service_request_id}|${resolvedPaymentType}`,
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: { name: description },
            unit_amount: amountInCents,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${req.headers.get("origin")}/payment-success?service_id=${service_request_id}&payment_type=${resolvedPaymentType}`,
      cancel_url: `${req.headers.get("origin")}/dashboard`,
      metadata: { service_request_id, payment_type: resolvedPaymentType },
    });

    // Only the initial booking should enter payment_pending. Quote payments
    // must not move the service out of the technician's active workflow.
    if (payment_type === "booking") {
      await supabaseClient
        .from("service_requests")
        .update({ status: "payment_pending" })
        .eq("id", service_request_id);
    }

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
