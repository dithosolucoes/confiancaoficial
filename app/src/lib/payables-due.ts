// Contas a pagar: o que vence nos próximos dias. Módulo puro (sem React), testado em src/test/payables-due.test.ts.

export interface DuePayable {
  id: string;
  description: string;
  supplier_name: string | null;
  total_amount: number;
  paid_amount: number;
  due_date: string; // YYYY-MM-DD
  status: string;
}

export interface DueItem<T> {
  item: T;
  daysLeft: number;
  remaining: number;
}

const CLOSED = new Set(["pago", "cancelado"]);
const CENT = 0.005;

/** Data local no formato YYYY-MM-DD. (toISOString usa UTC e erra o dia entre 00:00 e 01:00 em Portugal no verão.) */
export function localISODate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Dias de calendário de `from` até `to` (ambas YYYY-MM-DD). Só conta datas, sem horas nem fuso. */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

/** Saldo em aberto: total menos o já pago, nunca negativo. */
export function remainingOf(p: Pick<DuePayable, "total_amount" | "paid_amount">): number {
  return Math.max(0, Number(p.total_amount || 0) - Number(p.paid_amount || 0));
}

/**
 * Contas que vencem de hoje até `days` dias (inclusive), ordenadas pelo prazo.
 * Ficam de fora: pagas, canceladas, sem saldo em aberto, já vencidas (essas aparecem
 * no indicador "Vencido") e as que vencem depois do limite.
 */
export function dueWithinDays<T extends DuePayable>(items: T[], today: string, days = 7): DueItem<T>[] {
  const out: DueItem<T>[] = [];
  for (const item of items) {
    if (CLOSED.has(item.status)) continue;
    const remaining = remainingOf(item);
    if (remaining < CENT) continue;
    const daysLeft = daysBetween(today, item.due_date);
    if (daysLeft < 0 || daysLeft > days) continue;
    out.push({ item, daysLeft, remaining });
  }
  return out.sort((a, b) =>
    a.daysLeft - b.daysLeft || a.item.description.localeCompare(b.item.description, "pt"));
}

/** Texto curto do prazo: "hoje", "amanhã" ou "em N dias". */
export function dueLabelPt(daysLeft: number): string {
  if (daysLeft === 0) return "hoje";
  if (daysLeft === 1) return "amanhã";
  return `em ${daysLeft} dias`;
}
