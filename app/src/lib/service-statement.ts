/**
 * Extrato de um serviço: quanto o cliente paga, e como cada valor é dividido
 * entre técnico e Confiança. Usa a regra gravada no chamado (financial_rule_snapshot)
 * e a mesma base de cálculo de computeServiceFinancials, para os números baterem.
 */

import {
  billableExtraFee,
  billableLabor,
  isQuoteRejectedService,
  isServiceCancelled,
  ruleFromSnapshot,
  ServiceLike,
} from "./financial-rules";
import { getClientServiceFee } from "./payout";
import { splitServiceCents, eurosToCents, centsToEuros } from "./financial-split";

export interface ServiceStatement {
  /** Valor pago pelo cliente (visita cobrada + mão de obra + taxa extra). */
  clientTotal: number;
  visitCharged: number;
  technicianVisit: number;
  confiancaVisit: number;
  laborCharged: number;
  technicianLabor: number;
  confiancaLabor: number;
  technicianTotal: number;
  confiancaTotal: number;
  /** Empresa parceira (só em chamado com assigned_company_id). Sai da parte do técnico. */
  empresaVisit: number;
  empresaLabor: number;
  empresaTotal: number;
  /** true quando a regra veio gravada no chamado; false = regra padrão 50/50 (chamado antigo). */
  usesSnapshot: boolean;
}

export interface ServiceStatementInput extends ServiceLike {
  financial_rule_snapshot?: Record<string, unknown> | null;
}

const ZERO: ServiceStatement = {
  clientTotal: 0, visitCharged: 0, technicianVisit: 0, confiancaVisit: 0,
  laborCharged: 0, technicianLabor: 0, confiancaLabor: 0,
  technicianTotal: 0, confiancaTotal: 0, empresaVisit: 0, empresaLabor: 0, empresaTotal: 0, usesSnapshot: false,
};

export const buildServiceStatement = (service: ServiceStatementInput): ServiceStatement => {
  if (isServiceCancelled(service)) return ZERO;

  const rule = ruleFromSnapshot(service.financial_rule_snapshot);
  // Mesma base de computeServiceFinancials: garantia não cobra taxa de visita.
  const visitFee = service.is_warranty ? 0 : getClientServiceFee(service);
  const rejected = isQuoteRejectedService(service);
  // Orçamento recusado: só a visita entra; mão de obra e taxa extra ficam de fora.
  const labor = rejected ? 0 : billableLabor(service) + billableExtraFee(service);

  const split = splitServiceCents({
    visitFeeCents: eurosToCents(visitFee),
    laborCents: eurosToCents(labor),
    rule,
    partnerJob: !!service.assigned_company_id,
  });

  return {
    clientTotal: centsToEuros(split.clientTotal),
    visitCharged: centsToEuros(split.visit.charged),
    technicianVisit: centsToEuros(split.visit.technician),
    confiancaVisit: centsToEuros(split.visit.confianca),
    laborCharged: centsToEuros(split.labor.charged),
    technicianLabor: centsToEuros(split.labor.technician),
    confiancaLabor: centsToEuros(split.labor.confianca),
    technicianTotal: centsToEuros(split.technicianTotal),
    confiancaTotal: centsToEuros(split.confiancaTotal),
    empresaVisit: centsToEuros(split.visit.empresa),
    empresaLabor: centsToEuros(split.labor.empresa),
    empresaTotal: centsToEuros(split.empresaTotal),
    usesSnapshot: !!service.financial_rule_snapshot,
  };
};
