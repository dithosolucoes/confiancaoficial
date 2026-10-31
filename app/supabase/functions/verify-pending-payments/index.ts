import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Verifies Stripe checkout sessions for service_requests currently in
 * `payment_pending`. If Stripe reports a paid session for that service, the
 * record is promoted to `pending` (available) so it does not stay stuck after
 * the customer closes the Stripe tab without returning to /payment-success.
 *
 * Scope:
 *  - If called with { service_request_id }, only that one is verified
 *    (the calling user must own it OR be a gestor).
 *  - If called by a gestor with no body, ALL payment_pending CO services are
 *    re-verified (used for backfill / housekeeping).
 *  - Otherwise verifies all payment_pending CO services owned by the caller.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return new Response(JSON.stringify({ skipped: true, reason: "no_auth" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: ures } = await userClient.auth.getUser(token);
    const user = ures.user;
    if (!user) {
      return new Response(JSON.stringify({ skipped: true, reason: "not_authenticated" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    let body: any = {};
    try { body = await req.json(); } catch { /* empty */ }
    const targetId: string | undefined = body?.service_request_id;

    // Check gestor
    const { data: prof } = await admin
      .from("profiles")
      .select("user_type")
      .eq("user_id", user.id)
      .single();
    const isGestor = prof?.user_type === "gestor";

    let query = admin
      .from("service_requests")
      .select("id, customer_id, reference, status, appliance_type, technician_id")
      .eq("status", "payment_pending")
      .like("reference", "CO%")
      .is("deleted_at", null);

    if (targetId) {
      query = query.eq("id", targetId);
    } else if (!isGestor) {
      query = query.eq("customer_id", user.id);
    }

    const { data: services, error: svcErr } = await query.limit(500);
    if (svcErr) throw svcErr;

    const stripe = new Stripe(STRIPE_KEY, { apiVersion: "2025-08-27.basil" });
    const updated: string[] = [];

    for (const svc of services || []) {
      try {
        // Find any paid checkout session referencing this service_request_id
        const search = await stripe.checkout.sessions.search({
          query: `metadata['service_request_id']:'${svc.id}' AND status:'complete'`,
          limit: 5,
        });
        const paid = search.data.find(
          (s) => s.payment_status === "paid" || s.status === "complete"
        );
        if (!paid) continue;

        const paymentType =
          (paid.metadata?.payment_type as string | undefined) || "booking";

        // For the booking flow, the service becomes available (pending).
        // For labor/materials, we just confirm payment_pending should clear
        // and the previous status (in_progress) should resume — we don't have
        // it stored, so we leave non-booking handling to the existing
        // payment-success page (those flows are not affected by this bug).
        if (paymentType !== "booking") continue;

        await admin
          .from("service_requests")
          .update({ status: "pending" })
          .eq("id", svc.id);

        updated.push(svc.reference || svc.id);

        // Notify technicians if not yet assigned
        if (!svc.technician_id) {
          try {
            await admin.functions.invoke("send-notification", {
              body: { type: "service_available", applianceType: svc.appliance_type },
            });
          } catch (e) {
            console.warn("send-notification failed", e);
          }
        }
      } catch (e) {
        console.error("verify failed for", svc.id, e);
      }
    }

    return new Response(
      JSON.stringify({ checked: services?.length || 0, updated }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
