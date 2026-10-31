import { supabase } from "@/integrations/supabase/client";

/**
 * Fila de envio do técnico (offline-first).
 *
 * Regra: uma ação do técnico nunca é dada como salva se não chegou ao servidor.
 * - Enviou ao Supabase → "saved".
 * - Sem conexão (ou falha de rede) → guardada neste aparelho e reenviada ao reconectar → "queued".
 * - Servidor recusou (permissão, validação) → erro visível; nada é guardado em silêncio.
 *
 * A fila é só um rascunho de envio por aparelho. A fonte da verdade é sempre o banco.
 */

const KEY = "fix_outbox_v1";

export type OutboxItem = {
  id: string;
  serviceId: string;
  /** "update_service" (padrão, compatível com itens antigos) ou "insert_material". */
  kind?: "update_service" | "insert_material";
  updates: Record<string, unknown>;
  createdAt: string;
  attempts: number;
  lastError?: string;
};

export type SaveResult = "saved" | "queued";

const read = (): OutboxItem[] => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as OutboxItem[]) : [];
  } catch {
    return [];
  }
};

const write = (items: OutboxItem[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // Armazenamento cheio ou bloqueado: o chamador já recebe "queued" e o aviso ao técnico.
  }
};

export const getOutbox = (): OutboxItem[] => read();

export const getOutboxCount = (): number => read().length;

export const isNetworkError = (err: unknown): boolean => {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (err instanceof TypeError) return true;
  const msg = (err as { message?: string })?.message ?? "";
  return /failed to fetch|network|load failed|networkerror/i.test(msg);
};

const enqueue = (
  serviceId: string,
  updates: Record<string, unknown>,
  kind: OutboxItem["kind"] = "update_service",
) => {
  const items = read();
  items.push({
    id: crypto.randomUUID(),
    serviceId,
    kind,
    updates,
    createdAt: new Date().toISOString(),
    attempts: 0,
  });
  write(items);
};

const sendOne = async (item: Pick<OutboxItem, "serviceId" | "updates" | "kind">) => {
  if (item.kind === "insert_material") {
    const { error } = await supabase.from("service_materials").insert(item.updates as any);
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from("service_requests")
    .update({ ...item.updates, updated_at: new Date().toISOString() } as any)
    .eq("id", item.serviceId);
  if (error) throw error;
};

/**
 * Grava uma alteração de serviço feita pelo técnico.
 * Retorna "saved" (no servidor) ou "queued" (guardada, será reenviada).
 * Lança erro quando o servidor recusa: o chamador mostra o erro.
 */
export const saveServiceUpdate = async (
  serviceId: string,
  updates: Record<string, unknown>
): Promise<SaveResult> => {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    enqueue(serviceId, updates, "update_service");
    return "queued";
  }
  try {
    await sendOne({ serviceId, updates, kind: "update_service" });
    return "saved";
  } catch (err) {
    if (isNetworkError(err)) {
      enqueue(serviceId, updates, "update_service");
      return "queued";
    }
    throw err;
  }
};

/**
 * Grava uma peça/material novo lançado pelo técnico (service_materials).
 * Mesma regra da fila: sem rede, fica guardado no aparelho e é reenviado ao
 * reconectar. Fotos de peça continuam fora da fila (ver TechnicianMaterialsSection).
 */
export const saveMaterialInsert = async (
  serviceId: string,
  material: Record<string, unknown>
): Promise<SaveResult> => {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    enqueue(serviceId, material, "insert_material");
    return "queued";
  }
  try {
    await sendOne({ serviceId, updates: material, kind: "insert_material" });
    return "saved";
  } catch (err) {
    if (isNetworkError(err)) {
      enqueue(serviceId, material, "insert_material");
      return "queued";
    }
    throw err;
  }
};

/**
 * Reenvia a fila em ordem. Para na primeira falha de rede (tenta de novo depois).
 * Falhas do servidor ficam na fila com o motivo, para o técnico ver.
 */
export const flushOutbox = async (): Promise<{ sent: number; pending: number; rejected: number }> => {
  let items = read();
  let sent = 0;
  let rejected = 0;
  const remaining: OutboxItem[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      await sendOne(item);
      sent++;
    } catch (err) {
      if (isNetworkError(err)) {
        remaining.push(...items.slice(i));
        break;
      }
      rejected++;
      remaining.push({
        ...item,
        attempts: item.attempts + 1,
        lastError: (err as { message?: string })?.message ?? "Recusado pelo servidor",
      });
    }
  }

  items = remaining;
  write(items);
  return { sent, pending: items.length, rejected };
};

/** Tenta reenviar ao reconectar e ao iniciar. Retorna a função de limpeza. */
export const startOutboxAutoFlush = (onFlushed?: () => void): (() => void) => {
  const run = async () => {
    if (getOutboxCount() === 0) return;
    const result = await flushOutbox();
    if (result.sent > 0) onFlushed?.();
  };
  const onOnline = () => void run();
  window.addEventListener("online", onOnline);
  void run();
  return () => window.removeEventListener("online", onOnline);
};
