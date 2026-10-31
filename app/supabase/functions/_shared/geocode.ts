// deno-lint-ignore-file no-explicit-any
// Geocodificação com cache e limite de pedidos (Nominatim). Módulo puro: sem Deno/Node;
// rede, cache, relógio e espera entram por injeção, para ser testado em src/test/geocode.test.ts.

export interface LatLng { lat: number; lng: number }

export interface GeocodeCacheStore {
  get(key: string): Promise<LatLng | null>;
  put(key: string, address: string, point: LatLng): Promise<void>;
}

export interface GeocoderOptions {
  baseUrl: string;
  userAgent: string;
  fetchFn: typeof fetch;
  minIntervalMs?: number; // padrão 1100 ms: a política do Nominatim pede no máximo 1 pedido/s
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/** Chave canónica do endereço: sem acentos, minúsculas, pontuação e espaços normalizados. */
export function addressKey(address: string | null | undefined): string {
  return (address || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Cache no Postgres (tabela public.geocode_cache). Recebe o cliente admin (service role). */
export function supabaseGeocodeStore(admin: any): GeocodeCacheStore {
  return {
    async get(key) {
      const { data, error } = await admin
        .from("geocode_cache")
        .select("latitude, longitude")
        .eq("address_key", key)
        .maybeSingle();
      if (error || !data) return null;
      const lat = Number(data.latitude);
      const lng = Number(data.longitude);
      return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    },
    async put(key, address, point) {
      const { error } = await admin
        .from("geocode_cache")
        .upsert(
          { address_key: key, address, latitude: point.lat, longitude: point.lng },
          { onConflict: "address_key" },
        );
      if (error) throw new Error(error.message);
    },
  };
}

/**
 * Cria o geocoder. Garantias:
 * - procura primeiro no cache; só vai à rede se não encontrar;
 * - grava só resultados válidos (resposta vazia ou erro não é guardada);
 * - pedidos à rede saem em fila, com pelo menos minIntervalMs entre o início de cada um;
 * - pedidos simultâneos para o mesmo endereço partilham uma única ida à rede;
 * - falhas de cache ou de rede nunca rebentam: devolvem null (ou seguem sem cache).
 */
export function createGeocoder(opts: GeocoderOptions) {
  const minInterval = opts.minIntervalMs ?? 1100;
  const now = opts.now ?? (() => Date.now());
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const inflight = new Map<string, Promise<LatLng | null>>();
  let queue: Promise<unknown> = Promise.resolve();
  let lastStart: number | null = null;

  const schedule = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(async () => {
      if (lastStart !== null) {
        const wait = lastStart + minInterval - now();
        if (wait > 0) await sleep(wait);
      }
      lastStart = now();
      return fn();
    });
    queue = run.catch(() => undefined);
    return run;
  };

  const queryNetwork = async (address: string): Promise<LatLng | null> => {
    try {
      const url = `${opts.baseUrl}/search?format=json&limit=1&countrycodes=pt&q=${encodeURIComponent(address)}`;
      const res = await opts.fetchFn(url, { headers: { "User-Agent": opts.userAgent, "Accept-Language": "pt" } });
      if (!res.ok) return null;
      const arr = await res.json();
      const first = Array.isArray(arr) ? arr[0] : null;
      if (!first) return null;
      const lat = Number(first.lat);
      const lng = Number(first.lon);
      return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    } catch {
      return null;
    }
  };

  const resolve = async (address: string, key: string, store: GeocodeCacheStore | null): Promise<LatLng | null> => {
    if (store) {
      try {
        const cached = await store.get(key);
        if (cached) return cached;
      } catch {
        // cache indisponível: segue para a rede
      }
    }
    const point = await schedule(() => queryNetwork(address));
    if (point && store) {
      try {
        await store.put(key, address, point);
      } catch {
        // gravar no cache é otimização: o resultado já é válido
      }
    }
    return point;
  };

  return function geocode(address: string, store: GeocodeCacheStore | null = null): Promise<LatLng | null> {
    const key = addressKey(address);
    if (!key) return Promise.resolve(null);
    const pending = inflight.get(key);
    if (pending) return pending;
    const p = resolve(address.trim(), key, store).finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  };
}
