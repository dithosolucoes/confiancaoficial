/**
 * Núcleo financeiro centralizado.
 *
 * ÚNICA fonte de verdade do frontend para receita, base elegível, repasse ao
 * técnico, lucro da empresa e lucro de materiais. Espelha exactamente a função
 * SQL `public.resolve_service_payout_amount` — se uma das duas mudar, a outra
 * tem de mudar na mesma alteração.
 *
 * Regra de corte: 01/08/2026 (Europe/Lisbon), decidida pela data de CRIAÇÃO do
 * serviço (`service_requests.created_at`). Serviços anteriores preservam
 * integralmente as regras e valores históricos.
 */

import {
  PAYOUT_RULE_CUTOFF,
  TECH_SHARE,
  LEGACY_TECH_SHARE,
  LEGACY_PROFIT_SHARE,
  PARTS_COST_VAT_FACTOR,
  getClientServiceFee,
  resolvePayoutReference,
  DEFAULT_PAYOUT_RATES,
} from "./payout";

export const FINANCIAL_RULES_CUTOFF = PAYOUT_RULE_CUTOFF;

/**
 * Regra de divisão gravada no chamado. Sem snapshot (chamado anterior à regra configurável),
 * vale 50% / 50%, que é a regra em vigor. Espelha a função SQL resolve_service_payout_amount.
 */
export const ruleFromSnapshot = (snap?: Record<string, unknown> | null) => ({
  visitCharged: snap?.visit_charged === undefined ? true : Boolean(snap.visit_charged),
  visitTechnicianPct: snap?.visit_technician_pct === undefined ? 50 : Number(snap.visit_technician_pct),
  laborConfiancaPct: snap?.labor_confianca_pct === undefined ? 50 : Number(snap.labor_confianca_pct),
  visitEmpresaPct: snap?.visit_empresa_pct === undefined ? 0 : Number(snap.visit_empresa_pct),
  laborEmpresaPct: snap?.labor_empresa_pct === undefined ? 0 : Number(snap.labor_empresa_pct),
});
export const FINANCIAL_RULES_VERSION_NEW = "2026-08-01";
export const FINANCIAL_RULES_VERSION_LEGACY = "legacy";

/** Percentagem da empresa sobre a base elegível do serviço (regra nova). */
export const COMPANY_SERVICE_SHARE = 1 - TECH_SHARE;

/** Participação do técnico sobre materiais/peças — sempre zero. */
export const TECH_MATERIALS_SHARE = 0;

export interface ServiceLike {
  created_at?: string | null;
  reference?: string | null;
  appliance_type?: string | null;
  deslocacao_fee?: number | null;
  labor_cost?: number | null;
  extra_fee?: number | null;
  quote_additional_value?: number | null;
  quote_additional_cost?: number | null;
  quote_status?: string | null;
  is_warranty?: boolean | null;
  labor_rejected_at?: string | null;
  labor_approved_at?: string | null;
  labor_paid_at?: string | null;
  fixed_payout_amount?: number | null;
  status?: string | null;
  /** Empresa parceira do chamado (service_requests.assigned_company_id). Null = sem empresa. */
  assigned_company_id?: string | null;
  /** Regra gravada no chamado na abertura (service_requests.financial_rule_snapshot). */
  financial_rule_snapshot?: Record<string, unknown> | null;
}

export interface MaterialLike {
  material_cost?: number | null; // valor cobrado ao cliente (unitário)
  supplier_cost?: number | null; // valor pago ao fornecedor (unitário)
  quantity?: number | null;
  status?: string | null;
}

export interface QuotePartLike {
  sale_value?: number | null; // valor cobrado ao cliente
  cost_without_vat?: number | null; // custo de fornecedor s/ IVA
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** true quando o serviço segue as regras financeiras de 01/08/2026. */
export const usesNewFinancialRules = (service?: ServiceLike | string | Date | null): boolean => {
  const raw =
    service && typeof service === "object" && !(service instanceof Date)
      ? (service as ServiceLike).created_at
      : (service as string | Date | null | undefined);
  if (!raw) return true;
  const d = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(d.getTime())) return true;
  return d.getTime() >= FINANCIAL_RULES_CUTOFF.getTime();
};

export const financialRulesVersion = (service?: ServiceLike | null): string =>
  usesNewFinancialRules(service) ? FINANCIAL_RULES_VERSION_NEW : FINANCIAL_RULES_VERSION_LEGACY;

/** Serviços cancelados ou com orçamento recusado não geram receita de M.O./peças. */
export const isServiceCancelled = (service?: ServiceLike | null): boolean =>
  (service?.status || "") === "cancelled";

export const isQuoteRejectedService = (service?: ServiceLike | null): boolean =>
  (service?.quote_status || "") === "rejected";

/** Mão de obra efectivamente cobrável (rejeitada sem aprovação/pagamento = 0). */
export const billableLabor = (service: ServiceLike): number => {
  if (service.labor_rejected_at && !service.labor_approved_at && !service.labor_paid_at) return 0;
  return num(service.labor_cost);
};

/** Taxa extra cobrável (garantia não cobra). */
export const billableExtraFee = (service: ServiceLike): number =>
  service.is_warranty ? 0 : num(service.extra_fee);

// ---------------------------------------------------------------------------
// Materiais
// ---------------------------------------------------------------------------

export interface MaterialsFinancials {
  /** Valor cobrado ao cliente (venda). */
  clientTotal: number;
  /** Valor pago ao fornecedor (custo real). */
  supplierTotal: number;
  /** Lucro bruto da empresa sobre materiais. */
  profit: number;
  /** Margem percentual sobre a venda. */
  marginPct: number;
  /** Participação do técnico — sempre 0. */
  technicianShare: number;
}

/**
 * Lucro do material = Valor Cobrado ao Cliente − Valor Pago ao Fornecedor.
 * Materiais rejeitados são sempre excluídos.
 */
export const computeMaterialsFinancials = (
  materials: MaterialLike[] = [],
  quoteParts: QuotePartLike[] = [],
): MaterialsFinancials => {
  let clientTotal = 0;
  let supplierTotal = 0;

  for (const m of materials) {
    if ((m.status || "") === "rejected") continue;
    const qty = num(m.quantity) || 1;
    clientTotal += num(m.material_cost) * qty;
    supplierTotal += num(m.supplier_cost) * qty;
  }
  for (const q of quoteParts) {
    clientTotal += num(q.sale_value);
    supplierTotal += num(q.cost_without_vat);
  }

  clientTotal = round2(clientTotal);
  supplierTotal = round2(supplierTotal);
  const profit = round2(clientTotal - supplierTotal);
  const marginPct = clientTotal > 0 ? round2((profit / clientTotal) * 100) : 0;

  return { clientTotal, supplierTotal, profit, marginPct, technicianShare: TECH_MATERIALS_SHARE };
};

// ---------------------------------------------------------------------------
// Serviço (base elegível, repasse, lucro)
// ---------------------------------------------------------------------------

export interface ServiceFinancials {
  ruleVersion: string;
  isNewRule: boolean;
  /** Taxa de Serviço cobrada ao cliente. */
  serviceFee: number;
  /** Mão de obra cobrável. */
  labor: number;
  /** Valor acrescentado pelo gestor, elegível para divisão. */
  managerExtra: number;
  /** Valor adicional do orçamento — 100% da empresa, não elegível. */
  additionalValue: number;
  /** Base elegível para divisão 50/50 com o técnico. */
  eligibleBase: number;
  technicianShareRate: number;
  /** Repasse ao técnico (fórmula; overrides/locks vivem no `technician_payout`). */
  technicianPayout: number;
  /** Lucro da empresa sobre o serviço (Confiança + empresa parceira). */
  companyServiceProfit: number;
  /** Parte da empresa parceira (0 se o chamado não for dela). */
  partnerShare: number;
  /** Parte da Confiança: lucro do serviço menos a parte da empresa parceira. */
  confiancaProfit: number;
}

/**
 * Cálculo do serviço. Espelha `resolve_service_payout_amount`:
 *   nova regra  → (taxa serviço + M.O. + taxa extra) × 50%
 *   regra antiga→ deslocação fixa + 70% (M.O. + extra) + 50% do lucro de peças
 */
export const computeServiceFinancials = (
  service: ServiceLike,
  materials: MaterialLike[] = [],
  quoteParts: QuotePartLike[] = [],
): ServiceFinancials => {
  const isNewRule = usesNewFinancialRules(service);
  const cancelled = isServiceCancelled(service);
  const rejected = isQuoteRejectedService(service);

  const serviceFee = service.is_warranty ? 0 : getClientServiceFee(service);
  const labor = cancelled ? 0 : billableLabor(service);
  const managerExtra = cancelled ? 0 : billableExtraFee(service);
  const additionalValue = cancelled ? 0 : num(service.quote_additional_value);

  if (isNewRule) {
    if (cancelled) {
      return {
        ruleVersion: FINANCIAL_RULES_VERSION_NEW,
        isNewRule,
        serviceFee: 0,
        labor: 0,
        managerExtra: 0,
        additionalValue: 0,
        eligibleBase: 0,
        technicianShareRate: TECH_SHARE,
        technicianPayout: 0,
        companyServiceProfit: 0,
        partnerShare: 0,
        confiancaProfit: 0,
      };
    }
    const rule = ruleFromSnapshot(service.financial_rule_snapshot);
    // Empresa parceira (chamado com assigned_company_id): a % dela sai da parte do técnico.
    const partnerJob = !!service.assigned_company_id;
    const visitPartnerShare = partnerJob ? rule.visitEmpresaPct / 100 : 0;
    const laborPartnerShare = partnerJob ? rule.laborEmpresaPct / 100 : 0;
    const visitShare = rule.visitTechnicianPct / 100 - visitPartnerShare;
    const laborShare = 1 - rule.laborConfiancaPct / 100 - laborPartnerShare;
    const visitEligible = rule.visitCharged ? serviceFee : 0;
    // Orçamento recusado: só a visita é elegível (visita realizada).
    const eligibleBase = rejected ? visitEligible : visitEligible + labor + managerExtra;
    const technicianPayout = rejected
      ? round2(visitEligible * visitShare)
      : round2(visitEligible * visitShare + (labor + managerExtra) * laborShare);
    // Parte da empresa parceira. Orçamento recusado: só a visita é elegível.
    const partnerShare = rejected
      ? round2(visitEligible * visitPartnerShare)
      : round2(visitEligible * visitPartnerShare + (labor + managerExtra) * laborPartnerShare);
    return {
      ruleVersion: FINANCIAL_RULES_VERSION_NEW,
      isNewRule,
      serviceFee,
      labor: rejected ? 0 : labor,
      managerExtra: rejected ? 0 : managerExtra,
      additionalValue,
      eligibleBase: round2(eligibleBase),
      technicianShareRate: TECH_SHARE,
      technicianPayout,
      companyServiceProfit: round2(eligibleBase - technicianPayout),
      partnerShare,
      confiancaProfit: round2(eligibleBase - technicianPayout - partnerShare),
    };
  }

  // ---- Regra antiga (histórica, preservada) ----
  const ref = resolvePayoutReference(service.reference, service.appliance_type);
  const fixed = num(service.fixed_payout_amount) || (ref ? DEFAULT_PAYOUT_RATES[ref] : 0);

  if (cancelled) {
    return {
      ruleVersion: FINANCIAL_RULES_VERSION_LEGACY,
      isNewRule,
      serviceFee: 0,
      labor: 0,
      managerExtra: 0,
      additionalValue: 0,
      eligibleBase: 0,
      technicianShareRate: LEGACY_TECH_SHARE,
      technicianPayout: 0,
      companyServiceProfit: 0,
      partnerShare: 0,
      confiancaProfit: 0,
    };
  }

  if (rejected) {
    return {
      ruleVersion: FINANCIAL_RULES_VERSION_LEGACY,
      isNewRule,
      serviceFee,
      labor: 0,
      managerExtra: 0,
      additionalValue,
      eligibleBase: 0,
      technicianShareRate: LEGACY_TECH_SHARE,
      technicianPayout: round2(fixed),
      companyServiceProfit: round2(serviceFee - fixed),

      partnerShare: 0,

      confiancaProfit: round2(serviceFee - fixed),
    };
  }

  let saleNoVat = num(service.quote_additional_value);
  let costNoVat = num(service.quote_additional_cost);
  for (const q of quoteParts) {
    saleNoVat += num(q.sale_value);
    costNoVat += num(q.cost_without_vat);
  }
  for (const m of materials) {
    if ((m.status || "") === "rejected") continue;
    const qty = num(m.quantity) || 1;
    saleNoVat += num(m.material_cost) * qty;
    costNoVat += num(m.supplier_cost) * qty;
  }
  const legacyProfit = Math.max(0, saleNoVat - costNoVat * PARTS_COST_VAT_FACTOR);
  const technicianPayout = round2(
    fixed + labor * LEGACY_TECH_SHARE + managerExtra * LEGACY_TECH_SHARE + legacyProfit * LEGACY_PROFIT_SHARE,
  );

  return {
    ruleVersion: FINANCIAL_RULES_VERSION_LEGACY,
    isNewRule,
    serviceFee,
    labor,
    managerExtra,
    additionalValue,
    eligibleBase: round2(labor + managerExtra),
    technicianShareRate: LEGACY_TECH_SHARE,
    technicianPayout,
    companyServiceProfit: round2(serviceFee + labor + managerExtra - technicianPayout),
    partnerShare: 0,
    confiancaProfit: round2(serviceFee + labor + managerExtra - technicianPayout),
  };
};

// ---------------------------------------------------------------------------
// Visão consolidada por serviço
// ---------------------------------------------------------------------------

export interface ServiceFinancialSummary extends ServiceFinancials {
  materials: MaterialsFinancials;
  /** Receita total = valor total pago/cobrado ao cliente (entra integralmente no caixa). */
  totalRevenue: number;
  /** Lucro bruto da empresa = lucro do serviço + lucro dos materiais. */
  companyGrossProfit: number;
  /** Custos directos do serviço: repasse ao técnico + fornecedor. */
  directCosts: number;
}

/**
 * Consolidação usada por TODOS os painéis (gestor, empresa, técnico, cliente e
 * relatórios). Nenhuma tela deve recalcular estes valores localmente.
 *
 * Receita = Taxa de Serviço + M.O. + Taxa Extra + Adicional + Materiais ao cliente.
 * Conferência: Receita − Repasse Técnico − Custo Fornecedor = Lucro Bruto.
 */
export const computeServiceFinancialSummary = (
  service: ServiceLike,
  materials: MaterialLike[] = [],
  quoteParts: QuotePartLike[] = [],
): ServiceFinancialSummary => {
  const svc = computeServiceFinancials(service, materials, quoteParts);
  const cancelled = isServiceCancelled(service);
  const rejected = isQuoteRejectedService(service);

  const mats = cancelled || rejected
    ? { clientTotal: 0, supplierTotal: 0, profit: 0, marginPct: 0, technicianShare: 0 }
    : computeMaterialsFinancials(materials, quoteParts);

  const totalRevenue = round2(
    svc.serviceFee + svc.labor + svc.managerExtra + svc.additionalValue + mats.clientTotal,
  );

  const companyGrossProfit = round2(totalRevenue - svc.technicianPayout - svc.partnerShare - mats.supplierTotal);

  return {
    ...svc,
    materials: mats,
    totalRevenue,
    companyGrossProfit,
    directCosts: round2(svc.technicianPayout + svc.partnerShare + mats.supplierTotal),
  };
};

/** Repasse proporcional quando o cliente paga parcialmente (evita duplo repasse). */
export const computeProportionalPayout = (
  eligibleBase: number,
  eligibleReceived: number,
  alreadyTransferred = 0,
  shareRate: number = TECH_SHARE,
): number => {
  const base = Math.max(0, num(eligibleBase));
  if (base === 0) return 0;
  const received = Math.min(Math.max(0, num(eligibleReceived)), base);
  const due = received * shareRate;
  return round2(Math.max(0, due - Math.max(0, num(alreadyTransferred))));
};

// ---------------------------------------------------------------------------
// Desdobramento do repasse (para tabelas/relatórios do gestor)
// ---------------------------------------------------------------------------

export interface PayoutBreakdown {
  /** Parte do repasse originada na Taxa de Serviço/deslocação. */
  serviceFeeShare: number;
  /** Parte do repasse originada na Mão de Obra. */
  laborShare: number;
  /** Parte do repasse originada na Taxa Extra. */
  extraShare: number;
  /** Parte do repasse originada em peças/materiais (só regra antiga; 0 na nova). */
  materialsShare: number;
  /** Total do repasse — igual a `technician_payout` quando fornecido. */
  total: number;
}

/**
 * Desdobra o repasse oficial (`service_requests.technician_payout`, quando
 * disponível) nas suas componentes. Nunca inventa um total: se houver valor
 * gravado (incluindo overrides/locks do gestor) é esse que manda, e as
 * componentes são escaladas proporcionalmente para fechar exactamente nele.
 */
export const computePayoutBreakdown = (
  service: ServiceLike,
  materials: MaterialLike[] = [],
  quoteParts: QuotePartLike[] = [],
  storedPayout?: number | null,
): PayoutBreakdown => {
  const svc = computeServiceFinancials(service, materials, quoteParts);
  const rate = svc.technicianShareRate;

  let serviceFeeShare: number;
  let laborShare: number;
  let extraShare: number;
  let materialsShare: number;

  if (svc.isNewRule) {
    serviceFeeShare = svc.serviceFee * rate;
    laborShare = svc.labor * rate;
    extraShare = svc.managerExtra * rate;
    materialsShare = 0;
  } else {
    const ref = resolvePayoutReference(service.reference, service.appliance_type);
    const fixed = num(service.fixed_payout_amount) || (ref ? DEFAULT_PAYOUT_RATES[ref] : 0);
    serviceFeeShare = fixed;
    laborShare = svc.labor * rate;
    extraShare = svc.managerExtra * rate;
    materialsShare = Math.max(0, svc.technicianPayout - fixed - laborShare - extraShare);
  }

  const formulaTotal = serviceFeeShare + laborShare + extraShare + materialsShare;
  const stored = storedPayout === null || storedPayout === undefined ? null : num(storedPayout);
  const total = stored === null ? formulaTotal : stored;

  if (stored !== null && formulaTotal > 0 && Math.abs(stored - formulaTotal) > 0.005) {
    const k = stored / formulaTotal;
    serviceFeeShare *= k;
    laborShare *= k;
    extraShare *= k;
    materialsShare *= k;
  } else if (stored !== null && formulaTotal === 0) {
    serviceFeeShare = stored;
  }

  return {
    serviceFeeShare: round2(serviceFeeShare),
    laborShare: round2(laborShare),
    extraShare: round2(extraShare),
    materialsShare: round2(materialsShare),
    total: round2(total),
  };
};
