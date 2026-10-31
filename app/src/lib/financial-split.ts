/**
 * Divisão de um chamado entre Confiança, empresa parceira e técnico, em centavos (inteiros).
 *
 * Regras (decididas pelo Thomas, 31/10/2026):
 * - Confiança: a % dela não muda, com ou sem empresa parceira.
 * - Empresa parceira: só em chamado com empresa (assigned_company_id). A % dela sai da parte do técnico.
 * - Técnico: fica com o resto.
 * - Taxa de visita e mão de obra seguem a mesma regra. A taxa extra segue a mão de obra.
 * - Peças: ficam 100% com a Confiança (margem). Não entram neste cálculo.
 *
 * Sem empresa parceira, a empresa recebe zero e o técnico recebe o mesmo de antes.
 * O técnico recebe o resto do arredondamento: nenhum centavo se perde.
 */

export interface FinancialRule {
  /** Se a taxa de visita é cobrada neste tipo de serviço. */
  visitCharged: boolean;
  /** % da taxa de visita que vai para o técnico, antes da empresa parceira (0–100). */
  visitTechnicianPct: number;
  /** % da mão de obra que fica com a Confiança (0–100). */
  laborConfiancaPct: number;
  /** % da visita para a empresa parceira, saindo da parte do técnico. Só vale com empresa. */
  visitEmpresaPct?: number;
  /** % da mão de obra para a empresa parceira, saindo da parte do técnico. Só vale com empresa. */
  laborEmpresaPct?: number;
}

export interface SplitInput {
  visitFeeCents: number;
  laborCents: number;
  rule: FinancialRule;
  /** Chamado da empresa parceira (tem assigned_company_id). */
  partnerJob?: boolean;
}

export interface SplitResult {
  visit: { charged: number; technician: number; confianca: number; empresa: number };
  labor: { charged: number; technician: number; confianca: number; empresa: number };
  clientTotal: number;
  technicianTotal: number;
  confiancaTotal: number;
  empresaTotal: number;
}

export const DEFAULT_FINANCIAL_RULE: FinancialRule = {
  visitCharged: true,
  visitTechnicianPct: 50,
  laborConfiancaPct: 50,
  visitEmpresaPct: 0,
  laborEmpresaPct: 0,
};

const isPct = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100;

/** Erros de validação de uma regra. Lista vazia = regra válida. */
export const validateFinancialRule = (rule: FinancialRule): string[] => {
  const errors: string[] = [];
  const visitEmp = rule.visitEmpresaPct ?? 0;
  const laborEmp = rule.laborEmpresaPct ?? 0;
  if (!isPct(rule.visitTechnicianPct)) errors.push("A % do técnico na taxa de visita deve estar entre 0 e 100.");
  if (!isPct(rule.laborConfiancaPct)) errors.push("A comissão da Confiança na mão de obra deve estar entre 0 e 100.");
  if (!isPct(visitEmp)) errors.push("A % da empresa parceira na visita deve estar entre 0 e 100.");
  if (!isPct(laborEmp)) errors.push("A % da empresa parceira na mão de obra deve estar entre 0 e 100.");
  if (isPct(rule.visitTechnicianPct) && isPct(visitEmp) && visitEmp > rule.visitTechnicianPct) {
    errors.push("A % da empresa parceira na visita não pode ser maior que a % do técnico na visita.");
  }
  if (isPct(rule.laborConfiancaPct) && isPct(laborEmp) && laborEmp > 100 - rule.laborConfiancaPct) {
    errors.push("A % da empresa parceira na mão de obra não pode passar do que sobra depois da Confiança.");
  }
  return errors;
};

/** Converte euros (ex.: 12.5) em centavos inteiros (1250). */
export const eurosToCents = (euros: number): number => Math.round((Number(euros) || 0) * 100);

/** Converte centavos em euros para mostrar na tela. */
export const centsToEuros = (cents: number): number => Math.round(cents) / 100;

const assertCents = (name: string, v: number) => {
  if (!Number.isInteger(v) || v < 0) throw new Error(`${name} deve ser um inteiro de centavos >= 0`);
};

/**
 * Calcula a divisão. Percentuais podem ter decimais (ex.: 33.33).
 * Arredondamento: técnico e empresa são arredondados; a Confiança fica com a diferença.
 */
export const splitServiceCents = ({ visitFeeCents, laborCents, rule, partnerJob = false }: SplitInput): SplitResult => {
  assertCents("visitFeeCents", visitFeeCents);
  assertCents("laborCents", laborCents);
  const errors = validateFinancialRule(rule);
  if (errors.length) throw new Error(errors[0]);

  const visitEmpPct = partnerJob ? (rule.visitEmpresaPct ?? 0) : 0;
  const laborEmpPct = partnerJob ? (rule.laborEmpresaPct ?? 0) : 0;

  const visitCharged = rule.visitCharged ? visitFeeCents : 0;
  const visitEmpresa = Math.round((visitCharged * visitEmpPct) / 100);
  const visitTechnician = Math.round((visitCharged * (rule.visitTechnicianPct - visitEmpPct)) / 100);
  const visitConfianca = visitCharged - visitTechnician - visitEmpresa;

  const laborConfianca = Math.round((laborCents * rule.laborConfiancaPct) / 100);
  const laborEmpresa = Math.round((laborCents * laborEmpPct) / 100);
  const laborTechnician = laborCents - laborConfianca - laborEmpresa;

  return {
    visit: { charged: visitCharged, technician: visitTechnician, confianca: visitConfianca, empresa: visitEmpresa },
    labor: { charged: laborCents, technician: laborTechnician, confianca: laborConfianca, empresa: laborEmpresa },
    clientTotal: visitCharged + laborCents,
    technicianTotal: visitTechnician + laborTechnician,
    confiancaTotal: visitConfianca + laborConfianca,
    empresaTotal: visitEmpresa + laborEmpresa,
  };
};
