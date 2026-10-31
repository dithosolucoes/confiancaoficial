/**
 * Acréscimos ao serviço (M.O., materiais/peças e taxa extra) e respectivo saldo
 * pendente de pagamento pelo cliente.
 *
 * Fonte única de verdade do frontend para a regra:
 *   "sempre que o técnico acrescenta valor, o cliente tem de pagar".
 *
 * Anti-duplicação: cada componente tem o seu próprio marcador de pagamento
 * (`labor_paid_at` / `quote_paid_at` para M.O.+Taxa Extra, `materials_paid_at`
 * para materiais). Um componente já pago nunca volta a entrar no saldo.
 */

import type { MaterialLike, ServiceLike } from "./financial-rules";
import { billableExtraFee, billableLabor, isServiceCancelled, isQuoteRejectedService } from "./financial-rules";

export type ChargeKind = "labor" | "materials" | "extra";
export type ChargeState = "pending" | "awaiting_payment" | "paid" | "cancelled";

export interface AdditionalChargeItem {
  id: string;
  kind: ChargeKind;
  label: string;
  description?: string;
  quantity?: number;
  unitAmount?: number;
  amount: number;
  state: ChargeState;
  paidAt?: string | null;
}

export interface AdditionalChargesSummary {
  items: AdditionalChargeItem[];
  /** Total acrescentado (pago + pendente). */
  totalCharged: number;
  /** Total já confirmado como pago. */
  totalPaid: number;
  /** Saldo ainda por liquidar pelo cliente. */
  totalPending: number;
  hasPending: boolean;
  laborPaidAt: string | null;
  materialsPaidAt: string | null;
  /** Data do último pagamento confirmado (se houver). */
  lastPaidAt: string | null;
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number) => Math.round(n * 100) / 100;

export interface AdditionalMaterial extends MaterialLike {
  id?: string;
  material_name?: string | null;
}

export const computeAdditionalCharges = (
  service: (ServiceLike & { labor_paid_at?: string | null; quote_paid_at?: string | null; materials_paid_at?: string | null }) | null | undefined,
  materials: AdditionalMaterial[] = [],
): AdditionalChargesSummary => {
  const empty: AdditionalChargesSummary = {
    items: [], totalCharged: 0, totalPaid: 0, totalPending: 0,
    hasPending: false, laborPaidAt: null, materialsPaidAt: null, lastPaidAt: null,
  };
  if (!service) return empty;

  const cancelled = isServiceCancelled(service);
  const rejected = isQuoteRejectedService(service);
  if (cancelled) return empty;

  const laborPaidAt = (service.labor_paid_at || (service as any).quote_paid_at || null) as string | null;
  const materialsPaidAt = ((service as any).materials_paid_at || null) as string | null;

  const items: AdditionalChargeItem[] = [];

  const labor = rejected ? 0 : billableLabor(service);
  if (labor > 0) {
    items.push({
      id: "labor",
      kind: "labor",
      label: "Mão de obra adicional",
      amount: round2(labor),
      state: laborPaidAt ? "paid" : "awaiting_payment",
      paidAt: laborPaidAt,
    });
  }

  const extra = rejected ? 0 : billableExtraFee(service);
  if (extra > 0) {
    items.push({
      id: "extra",
      kind: "extra",
      label: "Taxa extra",
      amount: round2(extra),
      state: laborPaidAt ? "paid" : "awaiting_payment",
      paidAt: laborPaidAt,
    });
  }

  if (!rejected) {
    for (const m of materials) {
      const status = (m.status || "").toLowerCase();
      if (status === "rejected") {
        continue;
      }
      const qty = num(m.quantity) || 1;
      const unit = num(m.material_cost);
      const amount = round2(unit * qty);
      if (amount <= 0) continue;
      items.push({
        id: String(m.id || `${m.material_name}-${unit}`),
        kind: "materials",
        label: m.material_name || "Material",
        quantity: qty,
        unitAmount: round2(unit),
        amount,
        state: materialsPaidAt ? "paid" : "awaiting_payment",
        paidAt: materialsPaidAt,
      });
    }
  }

  const totalCharged = round2(items.reduce((s, i) => s + i.amount, 0));
  const totalPaid = round2(items.filter((i) => i.state === "paid").reduce((s, i) => s + i.amount, 0));
  const totalPending = round2(totalCharged - totalPaid);

  const paidDates = [laborPaidAt, materialsPaidAt].filter(Boolean) as string[];
  const lastPaidAt = paidDates.length
    ? paidDates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
    : null;

  return {
    items,
    totalCharged,
    totalPaid,
    totalPending: totalPending > 0.004 ? totalPending : 0,
    hasPending: totalPending > 0.004,
    laborPaidAt,
    materialsPaidAt,
    lastPaidAt,
  };
};

export const chargeKindLabel = (kind: ChargeKind): string =>
  kind === "labor" ? "Mão de Obra" : kind === "extra" ? "Taxa Extra" : "Material/Peça";
