import { describe, it, expect } from "vitest";
import { computeServiceFinancials } from "@/lib/financial-rules";

// Serviço criado hoje, com taxa de visita €55 e mão de obra €100.
const base = {
  created_at: "2026-10-30T10:00:00Z",
  appliance_type: "Máquina de Lavar Roupa",
  deslocacao_fee: 55,
  labor_cost: 100,
  extra_fee: 0,
  status: "completed",
};

const snap = (visit_technician_pct: number, labor_confianca_pct: number, visit_charged = true) => ({
  visit_technician_pct, labor_confianca_pct, visit_charged,
});

describe("computeServiceFinancials usa a regra gravada no chamado", () => {
  it("sem snapshot = regra padrão 50/50 (técnico recebe 77.50)", () => {
    expect(computeServiceFinancials(base).technicianPayout).toBe(77.5);
  });

  it("snapshot 50/50 dá o mesmo valor de quando não há snapshot", () => {
    expect(computeServiceFinancials({ ...base, financial_rule_snapshot: snap(50, 50) }).technicianPayout).toBe(77.5);
  });

  it("visita a 40% e M.O. 50%: 22.00 + 50.00 = 72.00", () => {
    expect(computeServiceFinancials({ ...base, financial_rule_snapshot: snap(40, 50) }).technicianPayout).toBe(72);
  });

  it("Confiança com 30% da M.O.: técnico 0.5*55 + 0.7*100 = 97.50", () => {
    expect(computeServiceFinancials({ ...base, financial_rule_snapshot: snap(50, 30) }).technicianPayout).toBe(97.5);
  });

  it("visita não cobrada: técnico recebe só a M.O. (50.00)", () => {
    expect(computeServiceFinancials({ ...base, financial_rule_snapshot: snap(50, 50, false) }).technicianPayout).toBe(50);
  });

  it("orçamento recusado: só a visita, na % gravada (40% de 55 = 22.00)", () => {
    expect(
      computeServiceFinancials({ ...base, labor_cost: 0, quote_status: "rejected", financial_rule_snapshot: snap(40, 50) }).technicianPayout,
    ).toBe(22);
  });

  it("chamado antigo com regra 50/50 gravada não muda", () => {
    const withSnap = computeServiceFinancials({ ...base, financial_rule_snapshot: snap(50, 50) });
    const without = computeServiceFinancials(base);
    expect(withSnap.technicianPayout).toBe(without.technicianPayout);
    expect(withSnap.companyServiceProfit).toBe(without.companyServiceProfit);
  });
});
