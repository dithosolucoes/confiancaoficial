import { describe, it, expect } from "vitest";
import { computeServiceFinancials } from "@/lib/financial-rules";
import { splitServiceCents, validateFinancialRule, DEFAULT_FINANCIAL_RULE } from "@/lib/financial-split";

// Vetor de referência (decidido com o Thomas):
// taxa de visita €60, mão de obra €100, técnico 50% da visita, Confiança 50% da M.O.,
// empresa parceira 10% da visita e 20% da M.O. (saindo da parte do técnico).
const base = {
  created_at: "2026-10-30T10:00:00Z",
  appliance_type: "Máquina de Lavar Roupa",
  deslocacao_fee: 60,
  labor_cost: 100,
  extra_fee: 0,
  status: "completed",
};
const snap = {
  visit_technician_pct: 50,
  labor_confianca_pct: 50,
  visit_charged: true,
  visit_empresa_pct: 10,
  labor_empresa_pct: 20,
};
const partner = { ...base, assigned_company_id: "11111111-1111-1111-1111-111111111111", financial_rule_snapshot: snap };
const noPartner = { ...base, assigned_company_id: null, financial_rule_snapshot: snap };

describe("empresa parceira: repasse no motor (lado TypeScript)", () => {
  it("chamado da empresa: técnico 54, empresa 26, Confiança 80", () => {
    const f = computeServiceFinancials(partner);
    expect(f.technicianPayout).toBe(54);
    expect(f.partnerShare).toBe(26);
    expect(f.confiancaProfit).toBe(80);
  });

  it("chamado da empresa: lucro da empresa (companyServiceProfit) = Confiança + parceira = 106", () => {
    const f = computeServiceFinancials(partner);
    expect(f.companyServiceProfit).toBe(106);
    expect(f.confiancaProfit + f.partnerShare).toBe(f.companyServiceProfit);
  });

  it("chamado sem empresa: técnico volta a 80 (50% visita + 50% M.O.), parceira zero", () => {
    const f = computeServiceFinancials(noPartner);
    expect(f.technicianPayout).toBe(80);
    expect(f.partnerShare).toBe(0);
    expect(f.confiancaProfit).toBe(80);
  });

  it("regra antiga sem as chaves de empresa: empresa zero, técnico igual ao de antes", () => {
    const old = { ...base, assigned_company_id: "x", financial_rule_snapshot: { visit_technician_pct: 50, labor_confianca_pct: 50, visit_charged: true } };
    const f = computeServiceFinancials(old);
    expect(f.partnerShare).toBe(0);
    expect(f.technicianPayout).toBe(80);
  });

  it("orçamento recusado em chamado da empresa: só a visita entra (parceira 10% de 60 = 6)", () => {
    const f = computeServiceFinancials({ ...partner, labor_cost: 0, quote_status: "rejected" });
    expect(f.partnerShare).toBe(6);
    expect(f.technicianPayout).toBe(24);
  });

  it("garantia: visita não é cobrada, então a parceira não recebe pela visita", () => {
    const f = computeServiceFinancials({ ...partner, is_warranty: true });
    expect(f.partnerShare).toBe(20);
    expect(f.technicianPayout).toBe(30);
  });
});

describe("empresa parceira: divisão em centavos (splitServiceCents)", () => {
  const rule = { visitCharged: true, visitTechnicianPct: 50, laborConfiancaPct: 50, visitEmpresaPct: 10, laborEmpresaPct: 20 };

  it("vetor com empresa: visita 24/6/30, M.O. 30/20/50 (técnico/empresa/Confiança)", () => {
    const r = splitServiceCents({ visitFeeCents: 6000, laborCents: 10000, rule, partnerJob: true });
    expect(r.visit).toEqual({ charged: 6000, technician: 2400, empresa: 600, confianca: 3000 });
    expect(r.labor).toEqual({ charged: 10000, technician: 3000, empresa: 2000, confianca: 5000 });
    expect(r.technicianTotal).toBe(5400);
    expect(r.empresaTotal).toBe(2600);
    expect(r.confiancaTotal).toBe(8000);
  });

  it("sem empresa (partnerJob false): empresa zero mesmo com % preenchida", () => {
    const r = splitServiceCents({ visitFeeCents: 6000, laborCents: 10000, rule, partnerJob: false });
    expect(r.empresaTotal).toBe(0);
    expect(r.technicianTotal).toBe(8000);
  });

  it("nenhum centavo se perde com empresa e percentuais com dízima", () => {
    const r = splitServiceCents({
      visitFeeCents: 1001, laborCents: 999, partnerJob: true,
      rule: { visitCharged: true, visitTechnicianPct: 33.33, laborConfiancaPct: 33.33, visitEmpresaPct: 10.5, laborEmpresaPct: 10.5 },
    });
    expect(r.technicianTotal + r.empresaTotal + r.confiancaTotal).toBe(r.clientTotal);
  });

  it("empresa não pode ter mais que o técnico na visita, nem passar do que sobra na M.O.", () => {
    expect(validateFinancialRule({ ...DEFAULT_FINANCIAL_RULE, visitEmpresaPct: 60 }).length).toBe(1);
    expect(validateFinancialRule({ ...DEFAULT_FINANCIAL_RULE, laborEmpresaPct: 60 }).length).toBe(1);
    expect(() => splitServiceCents({ visitFeeCents: 100, laborCents: 100, partnerJob: true,
      rule: { ...rule, visitEmpresaPct: 60 } })).toThrow();
  });

  it("regra válida com empresa passa na validação", () => {
    expect(validateFinancialRule(rule)).toEqual([]);
  });
});
