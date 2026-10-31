import { geocodeAddress, routeByCar } from "../_shared/osm.ts";
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Raio da Terra em km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c * 1.35; // Fator de sinuosidade viária de Portugal
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
    if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json().catch(() => ({}));
    const { service_id, tech_lat, tech_lng } = body || {};
    if (!service_id || typeof tech_lat !== "number" || typeof tech_lng !== "number") {
      return new Response(JSON.stringify({ error: "invalid_params" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: job, error: jobErr } = await admin
      .from("service_requests")
      .select("id, technician_id, customer_id, address, postal_code")
      .eq("id", service_id)
      .maybeSingle();
    if (jobErr || !job) return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (job.technician_id !== user.id) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Destino: coordenadas do cliente ou geolocalização do endereço
    let destLat: number | null = null;
    let destLng: number | null = null;
    const { data: cust } = await admin.from("profiles").select("gps_lat, gps_lng").eq("user_id", job.customer_id).maybeSingle();
    if (cust?.gps_lat != null && cust?.gps_lng != null) {
      destLat = Number(cust.gps_lat);
      destLng = Number(cust.gps_lng);
    }

    let durationSec = 1500; // ~25 min fallback
    let eta_distance_km = 12.5;

    // 1. Geocodificação do endereço se necessário
    if (destLat == null || destLng == null) {
      const addr = [job.address, job.postal_code, "Portugal"].filter(Boolean).join(", ");
      const geo = await geocodeAddress(addr, admin);
      if (geo) { destLat = geo.lat; destLng = geo.lng; }
    }

    // 2. Cálculo de Rotas (Direto ou Fallback Geodésico)
    if (destLat != null && destLng != null) {
      let routeCalculated = false;

      const r = await routeByCar({ lat: tech_lat, lng: tech_lng }, { lat: destLat, lng: destLng });
      if (r) {
        durationSec = r.durationSec || 1200;
        eta_distance_km = Number((r.distanceMeters / 1000).toFixed(2));
        routeCalculated = true;
      }

      if (!routeCalculated) {
        // Fallback geodésico confiável para Portugal (Lisboa/Porto)
        const km = haversineDistanceKm(tech_lat, tech_lng, destLat, destLng);
        eta_distance_km = Number(km.toFixed(2));
        durationSec = Math.max(300, Math.round((km / 35) * 3600)); // média de 35 km/h em trânsito urbano
      }
    }

    const eta_minutes = Math.max(1, Math.round(durationSec / 60));

    const { error: updErr } = await admin
      .from("service_requests")
      .update({
        tech_on_the_way_at: new Date().toISOString(),
        tech_eta_minutes: eta_minutes,
        tech_eta_distance_km: eta_distance_km,
        tech_eta_computed_at: new Date().toISOString(),
        tech_origin_lat: tech_lat,
        tech_origin_lng: tech_lng,
      })
      .eq("id", service_id);

    if (updErr) {
      console.warn("Aviso ao gravar ETA no Supabase:", updErr.message);
    }

    return new Response(JSON.stringify({ eta_minutes, eta_distance_km, computed_at: new Date().toISOString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
