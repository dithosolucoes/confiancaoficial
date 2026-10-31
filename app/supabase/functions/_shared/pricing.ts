// IVA do agendamento. Módulo puro (sem Deno nem Node): usado pelo create-payment
// e coberto por teste em src/test/pricing.test.ts.
// A fonte da taxa é public.appliance_types.vat_rate (6 ou 23), nunca uma lista fixa aqui.

export interface CatalogVatRow {
  name: string;
  vat_rate: number | string;
}

export const DEFAULT_VAT_RATE = 0.23;

const normalize = (s?: string | null) =>
  (s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/**
 * Taxa (0.06 ou 0.23) do tipo de aparelho segundo o catálogo.
 * Devolve null quando o tipo não existe no catálogo (quem chama decide o padrão).
 */
export function findCatalogVatRate(applianceType: string | null | undefined, catalog: CatalogVatRow[]): number | null {
  const key = normalize(applianceType);
  if (!key) return null;
  const row = catalog.find((r) => normalize(r.name) === key);
  if (!row) return null;
  return Number(row.vat_rate) === 6 ? 0.06 : DEFAULT_VAT_RATE;
}

/** Taxa efetiva: a do catálogo, ou 23% quando o tipo não está no catálogo. */
export function vatRateFor(applianceType: string | null | undefined, catalog: CatalogVatRow[]): number {
  return findCatalogVatRate(applianceType, catalog) ?? DEFAULT_VAT_RATE;
}

/**
 * Valor da visita cobrado ao cliente (IVA incluído).
 * 1) a taxa cadastrada no tipo de serviço, copiada para deslocacao_fee no chamado;
 * 2) sem taxa cadastrada (vazia ou zero), o valor padrão por aparelho.
 * Mesma regra do repasse (resolve_service_payout_amount), para cobrança e repasse baterem.
 */
export function bookingFeeFor(service: { appliance_type?: string | null; deslocacao_fee?: number | string | null }) {
  const fee = Number(service.deslocacao_fee || 0);
  if (Number.isFinite(fee) && fee > 0) return { total: fee, source: "taxa_tipo" as const };
  const t = service.appliance_type;
  const total =
    t === "Esquentador reparação" || t === "Vistoria técnica / Seguradora" ? 85
    : t === "Esquentador instalação" ? 75
    : 55;
  return { total, source: "padrao_aparelho" as const };
}

/**
 * Valor que o cliente paga pela visita agora (IVA incluído). Zero quando não há visita a cobrar:
 * garantia/retrabalho, ou tipo de serviço com a regra "não cobrar visita" (gravada no chamado).
 */
export function bookingChargeFor(service: {
  appliance_type?: string | null;
  deslocacao_fee?: number | string | null;
  is_warranty?: boolean | null;
  financial_rule_snapshot?: { visit_charged?: boolean } | null;
}): { total: number; source: string } {
  if (service.is_warranty) return { total: 0, source: "garantia" };
  if (service.financial_rule_snapshot && service.financial_rule_snapshot.visit_charged === false) {
    return { total: 0, source: "sem_visita" };
  }
  return bookingFeeFor(service);
}

/** Decompõe um total que já inclui IVA em base e IVA (não soma nada). */
export function splitVat(totalWithVat: number, rate: number) {
  const total = Number(totalWithVat) || 0;
  const base = total / (1 + rate);
  return { total, base, vat: total - base, percent: Math.round(rate * 100) };
}
