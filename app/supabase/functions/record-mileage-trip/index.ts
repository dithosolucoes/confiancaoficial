import { geocodeAddress, routeByCar } from "../_shared/osm.ts";
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c * 1.35; // Fator de rota viária
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { service_id, return_to_office, tech_lat, tech_lng } = body || {};

    // Configurações padrão de deslocamento
    const { data: settings } = await admin.from("mileage_settings").select("*").limit(1).maybeSingle();
    const officeLat = Number(settings?.office_lat ?? 38.6450);
    const officeLng = Number(settings?.office_lng ?? -9.1580);
    const officeAddr = settings?.office_address ?? "Avenida Pinhal do Vidal, nº 30, Corroios";

    // Origem do trajeto
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const { data: lastTrip } = await admin
      .from("mileage_trips")
      .select("*")
      .eq("technician_id", user.id)
      .gte("started_at", todayStart.toISOString())
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let originLat: number, originLng: number, originAddr: string;
    if (lastTrip) {
      originLat = Number(lastTrip.destination_lat ?? officeLat);
      originLng = Number(lastTrip.destination_lng ?? officeLng);
      originAddr = lastTrip.destination_address ?? officeAddr;
    } else {
      originLat = officeLat;
      originLng = officeLng;
      originAddr = officeAddr;
    }

    let destLat: number | null = null;
    let destLng: number | null = null;
    let destAddr = "";
    let tripType = "office_to_client";
    let reference: string | null = null;

    if (return_to_office) {
      destLat = officeLat;
      destLng = officeLng;
      destAddr = officeAddr;
      tripType = "client_to_office";
    } else if (service_id) {
      const { data: job } = await admin
        .from("service_requests")
        .select("id, reference, address, postal_code, customer_id")
        .eq("id", service_id)
        .maybeSingle();

      if (!job) {
        return new Response(JSON.stringify({ error: "service_not_found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      reference = job.reference ?? null;
      const { data: cust } = await admin.from("profiles").select("gps_lat, gps_lng, address")
        .eq("user_id", job.customer_id).maybeSingle();
      if (cust?.gps_lat != null && cust?.gps_lng != null) {
        destLat = Number(cust.gps_lat); destLng = Number(cust.gps_lng);
      }
      destAddr = [job.address, job.postal_code, "Portugal"].filter(Boolean).join(", ");
      tripType = lastTrip ? "client_to_client" : "office_to_client";
    }

    // Geocodificação de destino se necessário
    if ((destLat == null || destLng == null) && destAddr) {
      const geo = await geocodeAddress(destAddr, admin);
      if (geo) { destLat = geo.lat; destLng = geo.lng; }
    }

    if (destLat == null || destLng == null) {
      destLat = officeLat;
      destLng = officeLng;
    }

    if (!lastTrip && typeof tech_lat === "number" && typeof tech_lng === "number") {
      originLat = tech_lat; originLng = tech_lng;
    }

    let distanceMeters = 0;
    let durationSec = 0;
    let routeFound = false;

    const r = await routeByCar({ lat: originLat, lng: originLng }, { lat: destLat, lng: destLng });
    if (r) {
      distanceMeters = r.distanceMeters;
      durationSec = r.durationSec;
      routeFound = true;
    }

    if (!routeFound) {
      const kmCalc = haversineDistanceKm(originLat, originLng, destLat, destLng);
      distanceMeters = Math.round(kmCalc * 1000);
      durationSec = Math.round((kmCalc / 40) * 3600);
    }

    const distanceKm = Number((distanceMeters / 1000).toFixed(2));
    const ratePerKm = Number(settings?.rate_per_km ?? 0.40);
    const amount = Number((distanceKm * ratePerKm).toFixed(2));

    const { data: inserted, error: insErr } = await admin.from("mileage_trips").insert({
      technician_id: user.id,
      service_id: service_id ?? null,
      service_reference: reference,
      trip_type: tripType,
      origin_address: originAddr,
      origin_lat: originLat,
      origin_lng: originLng,
      destination_address: destAddr,
      destination_lat: destLat,
      destination_lng: destLng,
      distance_km: distanceKm,
      duration_seconds: durationSec,
      rate_per_km: ratePerKm,
      amount,
      status: "pending",
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    }).select().single();

    if (insErr) {
      return new Response(JSON.stringify({ error: insErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, trip: inserted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
