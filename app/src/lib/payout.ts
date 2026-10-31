// Regras de remuneração fixa do técnico por referência de serviço.
// Os valores efectivos (editáveis pelo Gestor) vivem na tabela `technician_payout_rates`.
// Este módulo só contém helpers de classificação/normalização.

export type PayoutReference = "WO" | "SR" | "CO";

export const DEFAULT_PAYOUT_RATES: Record<PayoutReference, number> = {
  WO: 25,
  SR: 20,
  CO: 25,
};

// Tipos de aparelho que devem ser tratados como CO (€25 ao técnico).
export const CO_APPLIANCE_TYPES: readonly string[] = [
  "Frigorífico",
  "Refrigerador",
  "Arca",
  "Máquina de Lavar Roupa",
  "Lava e Seca",
  "Micro-ondas",
  "Placa de Indução",
  "Vitrocerâmica",
  "Forno",
  "Lava-louças",
  "Secadora",
  "Forno Elétrico",
  "Termocumulador",
];

const normalize = (s?: string | null) =>
  (s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const CO_NORM = CO_APPLIANCE_TYPES.map(normalize);

/**
 * Devolve a referência canónica (WO/SR/CO) usada para calcular o pagamento.
 * - Se a `reference` do serviço começar por WO/SR/CO usa-a directamente.
 * - Caso contrário (ex.: CA ou em branco) tenta derivar de `appliance_type`:
 *     se contiver um tipo da lista CO -> "CO"
 * - Devolve `null` se não for possível classificar.
 */
export const resolvePayoutReference = (
  reference?: string | null,
  applianceType?: string | null,
): PayoutReference | null => {
  const prefix = (reference || "").toUpperCase().slice(0, 2);
  if (prefix === "WO" || prefix === "SR" || prefix === "CO") return prefix;
  const norm = normalize(applianceType);
  if (!norm) return null;
  if (CO_NORM.some((t) => t && norm.includes(t))) return "CO";
  return null;
};

export const getPayoutAmount = (
  rates: Record<string, number> | null | undefined,
  ref: PayoutReference | null,
): number => {
  if (!ref) return 0;
  const r = rates?.[ref];
  return Number.isFinite(r as number) ? Number(r) : DEFAULT_PAYOUT_RATES[ref];
};

/** Percentagem do técnico sobre Taxa de Serviço, Mão de Obra e Taxa Extra (regra nova). */
export const TECH_SHARE = 0.5;

/**
 * Data de entrada em vigor das novas regras de remuneração dos técnicos.
 * Serviços criados antes desta data mantêm a regra antiga (não retroativo).
 */
export const PAYOUT_RULE_CUTOFF = new Date("2026-08-01T00:00:00+01:00");

/** Regra antiga: 70% da Mão de Obra e da Taxa Extra + 50% do lucro de peças/materiais. */
export const LEGACY_TECH_SHARE = 0.7;
export const LEGACY_PROFIT_SHARE = 0.5;

/** true quando o serviço segue a nova regra (criado a partir de 01/08/2026). */
export const usesNewPayoutRule = (createdAt?: string | Date | null): boolean => {
  if (!createdAt) return true;
  const d = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(d.getTime())) return true;
  return d.getTime() >= PAYOUT_RULE_CUTOFF.getTime();
};


export interface PayoutServiceItem {
  deslocacao_fee?: number | null;
  appliance_type?: string | null;
  labor_cost?: number | null;
  extra_fee?: number | null;
  status?: string | null;
  is_warranty?: boolean | null;
  created_at?: string | null;
}

/**
 * Taxa de Serviço efetivamente cobrada ao cliente (base do repasse ao técnico).
 * Espelha a função SQL `resolve_service_payout_amount`.
 */
export const getClientServiceFee = (service?: PayoutServiceItem | null): number => {
  const fee = Number(service?.deslocacao_fee);
  if (Number.isFinite(fee) && fee !== 0) return fee;
  const type = String(service?.appliance_type || "");
  if (type === "Esquentador reparação" || type === "Vistoria técnica / Seguradora") return 85;
  if (type === "Esquentador instalação") return 75;
  return 55;
};


/**
 * Lucro agregado das peças/adicional (regra atual):
 *   Subtotal (Peças + Adicional)              = Σ valor de venda
 *   Subtotal Custos (Peças + Adicional) c/IVA = Σ custo apresentado com IVA no orçamento
 *   Lucro                                     = max(0, Subtotal − Subtotal Custos c/IVA)
 * Participação do Técnico = 50% do Lucro; Participação da Empresa = 50%.
 */
export const PARTS_COST_VAT_FACTOR = 1.23;

export interface PartsProfitBreakdown {
  sale: number;          // Subtotal venda
  costWithVat: number;   // Subtotal custos c/ IVA
  profit: number;        // Lucro = max(0, sale − costWithVat)
}

interface QuoteItemRow { sale_value?: number | null; cost_without_vat?: number | null }
interface MaterialRow {
  material_cost?: number | null;
  supplier_cost?: number | null;
  quantity?: number | null;
  status?: string | null;
}

export const computePartsProfitBreakdown = (
  quoteItems: QuoteItemRow[] = [],
  materials: MaterialRow[] = [],
): PartsProfitBreakdown => {
  let sale = 0;
  let costNoVat = 0;
  for (const q of quoteItems) {
    sale += Number(q.sale_value || 0);
    costNoVat += Number(q.cost_without_vat || 0);
  }
  for (const m of materials) {
    if ((m.status || "") === "rejected") continue;
    const qty = Number(m.quantity || 1);
    sale += Number(m.material_cost || 0) * qty;
    costNoVat += Number(m.supplier_cost || 0) * qty;
  }
  const costWithVat = costNoVat * PARTS_COST_VAT_FACTOR;
  return { sale, costWithVat, profit: Math.max(0, sale - costWithVat) };
};
