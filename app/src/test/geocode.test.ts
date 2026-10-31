import { describe, it, expect } from "vitest";
import {
  createGeocoder,
  addressKey,
  type GeocodeCacheStore,
  type LatLng,
} from "../../supabase/functions/_shared/geocode";

type Answer = (url: string) => { ok?: boolean; body?: unknown; throws?: boolean };
const LISBOA: LatLng = { lat: 38.7223, lng: -9.1393 };
const okAnswer: Answer = () => ({ body: [{ lat: String(LISBOA.lat), lon: String(LISBOA.lng) }] });

function memoryStore(initial: Record<string, LatLng> = {}) {
  const data = new Map<string, LatLng>(Object.entries(initial));
  const puts: Array<{ key: string; address: string; point: LatLng }> = [];
  const store: GeocodeCacheStore = {
    get: async (k) => data.get(k) ?? null,
    put: async (k, address, point) => {
      puts.push({ key: k, address, point });
      data.set(k, point);
    },
  };
  return { store, puts, data };
}

// Relógio falso: "esperar" avança o tempo sem esperar de verdade.
function setup(answer: Answer = okAnswer, minIntervalMs = 1100) {
  let t = 1_000_000;
  const sleeps: number[] = [];
  const calls: Array<{ url: string; at: number }> = [];
  const fetchFn = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push({ url, at: t });
    const a = answer(url);
    if (a.throws) throw new Error("rede caiu");
    return { ok: a.ok ?? true, json: async () => a.body } as Response;
  }) as typeof fetch;
  const geocode = createGeocoder({
    baseUrl: "https://nominatim.test",
    userAgent: "ConfiancaRepara/1.0",
    fetchFn,
    minIntervalMs,
    now: () => t,
    sleep: async (ms) => {
      sleeps.push(ms);
      t += ms;
    },
  });
  return { geocode, calls, sleeps, memory: memoryStore() };
}

describe("chave do endereço (addressKey)", () => {
  it("ignora maiúsculas, acentos, pontuação e espaços extra", () => {
    expect(addressKey("Rua  da Liberdade, 10")).toBe("rua da liberdade 10");
    expect(addressKey("RUA DA LIBERDADE 10")).toBe("rua da liberdade 10");
    expect(addressKey("Rua da Liberdade 10")).toBe(addressKey("Rua  da Liberdade, 10"));
    expect(addressKey("Avenida São João, 3")).toBe("avenida sao joao 3");
  });
  it("endereço vazio vira chave vazia", () => {
    expect(addressKey("   ")).toBe("");
    expect(addressKey(null)).toBe("");
  });
});

describe("cache antes da rede", () => {
  it("cache vazio: vai à rede uma vez e grava o resultado", async () => {
    const s = setup();
    const r = await s.geocode("Rua A, Lisboa, Portugal", s.memory.store);
    expect(r).toEqual(LISBOA);
    expect(s.calls.length).toBe(1);
    expect(s.memory.puts).toEqual([
      { key: addressKey("Rua A, Lisboa, Portugal"), address: "Rua A, Lisboa, Portugal", point: LISBOA },
    ]);
  });

  it("cache com o endereço: não vai à rede", async () => {
    const s = setup(() => ({ body: [{ lat: "0", lon: "0" }] }));
    const mem = memoryStore({ [addressKey("Rua A, Lisboa")]: LISBOA });
    const r = await s.geocode("Rua A, Lisboa", mem.store);
    expect(r).toEqual(LISBOA);
    expect(s.calls.length).toBe(0);
    expect(mem.puts.length).toBe(0);
  });

  it("mesmo endereço em chamadas seguidas: só uma ida à rede", async () => {
    const s = setup();
    await s.geocode("Rua A, Lisboa", s.memory.store);
    await s.geocode("Rua A, Lisboa", s.memory.store);
    await s.geocode("Rua A, Lisboa", s.memory.store);
    expect(s.calls.length).toBe(1);
  });

  it("variações do mesmo endereço (acento, caixa, pontuação) contam como um só", async () => {
    const s = setup();
    await s.geocode("Rua da Liberdade, 10", s.memory.store);
    await s.geocode("RUA DA LIBERDADE 10", s.memory.store);
    await s.geocode("rua  da liberdade,10", s.memory.store);
    expect(s.calls.length).toBe(1);
  });

  it("pedidos simultâneos para o mesmo endereço partilham uma única ida à rede", async () => {
    const s = setup();
    const [a, b, c] = await Promise.all([
      s.geocode("Rua B, Porto", s.memory.store),
      s.geocode("Rua B, Porto", s.memory.store),
      s.geocode("rua b porto", s.memory.store),
    ]);
    expect(a).toEqual(LISBOA);
    expect(b).toEqual(LISBOA);
    expect(c).toEqual(LISBOA);
    expect(s.calls.length).toBe(1);
  });

  it("sem cache (null): ainda geocodifica e não quebra", async () => {
    const s = setup();
    const r = await s.geocode("Rua C, Braga", null);
    expect(r).toEqual(LISBOA);
    expect(s.calls.length).toBe(1);
  });
});

describe("o que não entra no cache", () => {
  it("resposta vazia: devolve null, não grava e tenta de novo na próxima vez", async () => {
    const s = setup(() => ({ body: [] }));
    expect(await s.geocode("Rua D, Nada", s.memory.store)).toBeNull();
    expect(await s.geocode("Rua D, Nada", s.memory.store)).toBeNull();
    expect(s.memory.puts.length).toBe(0);
    expect(s.calls.length).toBe(2);
  });

  it("HTTP de erro: devolve null e não grava", async () => {
    const s = setup(() => ({ ok: false, body: {} }));
    expect(await s.geocode("Rua E, Faro", s.memory.store)).toBeNull();
    expect(s.memory.puts.length).toBe(0);
  });

  it("rede falha (exceção): devolve null e não grava", async () => {
    const s = setup(() => ({ throws: true }));
    expect(await s.geocode("Rua F, Évora", s.memory.store)).toBeNull();
    expect(s.memory.puts.length).toBe(0);
  });

  it("coordenadas inválidas: devolve null", async () => {
    const s = setup(() => ({ body: [{ lat: "abc", lon: "x" }] }));
    expect(await s.geocode("Rua G", s.memory.store)).toBeNull();
    expect(s.memory.puts.length).toBe(0);
  });

  it("endereço vazio: devolve null sem ir à rede", async () => {
    const s = setup();
    expect(await s.geocode("   ", s.memory.store)).toBeNull();
    expect(s.calls.length).toBe(0);
  });
});

describe("limite de pedidos (1 por segundo)", () => {
  it("dois endereços diferentes em simultâneo: a segunda ida espera pelo menos 1100 ms", async () => {
    const s = setup();
    await Promise.all([
      s.geocode("Rua H, Lisboa", s.memory.store),
      s.geocode("Rua I, Lisboa", s.memory.store),
    ]);
    expect(s.calls.length).toBe(2);
    expect(s.calls[1].at - s.calls[0].at).toBeGreaterThanOrEqual(1100);
    expect(s.sleeps).toContain(1100);
  });

  it("três pedidos simultâneos ficam espaçados de pelo menos 1100 ms cada", async () => {
    const s = setup();
    await Promise.all(["J", "K", "L"].map((x) => s.geocode(`Rua ${x}`, s.memory.store)));
    expect(s.calls.length).toBe(3);
    const gaps = [1, 2].map((i) => s.calls[i].at - s.calls[i - 1].at);
    expect(gaps.every((g) => g >= 1100)).toBe(true);
  });

  it("cache hit não chama a rede nem espera na fila", async () => {
    const s = setup();
    const mem = memoryStore({ [addressKey("Rua M")]: LISBOA });
    await s.geocode("Rua N", s.memory.store); // primeira ida à rede
    const callsAntes = s.calls.length;
    const esperasAntes = s.sleeps.length;
    const r = await s.geocode("Rua M", mem.store);
    expect(r).toEqual(LISBOA);
    expect(s.calls.length).toBe(callsAntes);
    expect(s.sleeps.length).toBe(esperasAntes);
  });
});

describe("falhas de cache não derrubam a geocodificação", () => {
  it("leitura do cache falha: segue para a rede", async () => {
    const s = setup();
    const broken: GeocodeCacheStore = {
      get: async () => { throw new Error("db fora"); },
      put: async () => {},
    };
    expect(await s.geocode("Rua O", broken)).toEqual(LISBOA);
    expect(s.calls.length).toBe(1);
  });

  it("gravação no cache falha: devolve o resultado mesmo assim", async () => {
    const s = setup();
    const broken: GeocodeCacheStore = {
      get: async () => null,
      put: async () => { throw new Error("db fora"); },
    };
    expect(await s.geocode("Rua P", broken)).toEqual(LISBOA);
  });
});
