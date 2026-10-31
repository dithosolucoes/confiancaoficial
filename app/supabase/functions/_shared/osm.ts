// deno-lint-ignore-file no-explicit-any
// Mapas sem Google: geocodificação (Nominatim/OpenStreetMap) e rota de carro (OSRM).
// Sem chave de API. Para produção com volume, apontar NOMINATIM_URL e OSRM_URL para
// servidores próprios (variáveis de ambiente opcionais).
import { createGeocoder, supabaseGeocodeStore, type LatLng } from "./geocode.ts";
const UA = "ConfiancaRepara/1.0";
const NOMINATIM_URL = Deno.env.get("NOMINATIM_URL") ?? "https://nominatim.openstreetmap.org";
const OSRM_URL = Deno.env.get("OSRM_URL") ?? "https://router.project-osrm.org";

export type { LatLng };

const geocoder = createGeocoder({
  baseUrl: NOMINATIM_URL,
  userAgent: UA,
  fetchFn: (input, init) => fetch(input, init),
});

/**
 * Coordenadas de um endereço. Passar o cliente admin usa e alimenta a tabela geocode_cache;
 * sem ele, só faz a chamada à rede (com o mesmo limite de 1 pedido/s).
 */
export function geocodeAddress(address: string, admin?: any): Promise<LatLng | null> {
  return geocoder(address, admin ? supabaseGeocodeStore(admin) : null);
}

export async function routeByCar(from: LatLng, to: LatLng): Promise<{ durationSec: number; distanceMeters: number } | null> {
  try {
    const url = `${OSRM_URL}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`;
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    const j = await res.json();
    const r = j?.routes?.[0];
    if (!r) return null;
    return {
      durationSec: Math.round(Number(r.duration) || 0),
      distanceMeters: Math.round(Number(r.distance) || 0),
    };
  } catch (_) {
    return null;
  }
}
