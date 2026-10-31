import { describe, it, expect } from "vitest";
import {
  computeServiceFinancialSummary,
  computeMaterialsFinancials,
  computeProportionalPayout,
  computePayoutBreakdown,
  usesNewFinancialRules,
  FINANCIAL_RULES_VERSION_LEGACY,
  FINANCIAL_RULES_VERSION_NEW,
} from "@/lib/financial-rules";


const NEW = "2026-08-01T09:00:00+01:00";
const OLD = "2026-07-31T09:00:00+01:00";

const service = (over: Record<string, unknown> = {}) => ({
  created_at: NEW,
  reference: "WO123456",
  appliance_type: "Forno",
  deslocacao_fee: 100,
  labor_cost: 0,
  extra_fee: 0,
  status: "completed",
  ...over,
});

describe("financial-rules — regras a partir de 01/08/2026", () => {
  it("Cenário 1 — serviço sem material", () => {
    const r = computeServiceFinancialSummary(service());
    expect(r.eligibleBase).toBe(100);
    expect(r.technicianPayout).toBe(50);
    expect(r.companyServiceProfit).toBe(50);
    expect(r.totalRevenue).toBe(100);
    expect(r.companyGrossProfit).toBe(50);
  });

  it("Cenário 2 — serviço com adicional do gestor", () => {
    const r = computeServiceFinancialSummary(service({ extra_fee: 40 }));
    expect(r.eligibleBase).toBe(140);
    expect(r.technicianPayout).toBe(70);
    expect(r.companyServiceProfit).toBe(70);
    expect(r.totalRevenue).toBe(140);
  });

  it("Cenário 3 — serviço com material (técnico não participa)", () => {
    const mats = [{ material_cost: 120, supplier_cost: 80, quantity: 1, status: "approved" }];
    const r = computeServiceFinancialSummary(service(), mats);
    expect(r.totalRevenue).toBe(220);
    expect(r.technicianPayout).toBe(50);
    expect(r.materials.technicianShare).toBe(0);
    expect(r.materials.profit).toBe(40);
    expect(r.companyGrossProfit).toBe(90);
  });

  it("Cenário 4 — serviço completo", () => {
    const mats = [{ material_cost: 120, supplier_cost: 80, quantity: 1, status: "approved" }];
    const r = computeServiceFinancialSummary(service({ extra_fee: 40 }), mats);
    expect(r.totalRevenue).toBe(260);
    expect(r.technicianPayout).toBe(70);
    expect(r.companyServiceProfit).toBe(70);
    expect(r.materials.profit).toBe(40);
    expect(r.companyGrossProfit).toBe(110);
    // Conferência: entrada − repasse − fornecedor = lucro bruto
    expect(r.totalRevenue - r.technicianPayout - r.materials.supplierTotal).toBe(110);
  });

  it("Cenário 5 — serviço anterior à vigência mantém regra antiga", () => {
    const r = computeServiceFinancialSummary(service({ created_at: OLD, labor_cost: 100 }));
    expect(usesNewFinancialRules({ created_at: OLD })).toBe(false);
    expect(r.ruleVersion).toBe(FINANCIAL_RULES_VERSION_LEGACY);
    // WO: deslocação fixa 25 + 70% da M.O.
    expect(r.technicianPayout).toBe(95);
  });

  it("Cenário 6 — serviço na data de vigência aplica regra nova", () => {
    const r = computeServiceFinancialSummary(service({ created_at: NEW, labor_cost: 100 }));
    expect(r.ruleVersion).toBe(FINANCIAL_RULES_VERSION_NEW);
    expect(r.technicianPayout).toBe(100); // (100 + 100) × 50%
  });

  it("Cenário 7 — pagamentos parciais não duplicam repasse", () => {
    const first = computeProportionalPayout(200, 100, 0);
    expect(first).toBe(50);
    const second = computeProportionalPayout(200, 200, first);
    expect(second).toBe(50);
    expect(first + second).toBe(100);
  });

  it("Cenário 8 — material rejeitado é excluído de tudo", () => {
    const mats = [
      { material_cost: 120, supplier_cost: 80, quantity: 1, status: "rejected" },
      { material_cost: 50, supplier_cost: 30, quantity: 1, status: "approved" },
    ];
    const m = computeMaterialsFinancials(mats);
    expect(m.clientTotal).toBe(50);
    expect(m.supplierTotal).toBe(30);
    expect(m.profit).toBe(20);
    const r = computeServiceFinancialSummary(service(), mats);
    expect(r.totalRevenue).toBe(150);
  });

  it("Cenário 9 — serviço cancelado não gera receita, lucro nem repasse", () => {
    const mats = [{ material_cost: 120, supplier_cost: 80, quantity: 1, status: "approved" }];
    const r = computeServiceFinancialSummary(service({ status: "cancelled", extra_fee: 40 }), mats);
    expect(r.totalRevenue).toBe(0);
    expect(r.technicianPayout).toBe(0);
    expect(r.companyGrossProfit).toBe(0);
  });

  it("Cenário 10 — orçamento recusado paga só 50% da taxa de serviço", () => {
    const r = computeServiceFinancialSummary(
      service({ quote_status: "rejected", labor_cost: 80, extra_fee: 40 }),
    );
    expect(r.eligibleBase).toBe(100);
    expect(r.technicianPayout).toBe(50);
    expect(r.totalRevenue).toBe(100);
  });

  it("margem percentual do material", () => {
    const m = computeMaterialsFinancials([
      { material_cost: 120, supplier_cost: 80, quantity: 1, status: "approved" },
    ]);
    expect(m.marginPct).toBe(33.33);
  });

  it("garantia não cobra taxa de serviço nem taxa extra", () => {
    const r = computeServiceFinancialSummary(service({ is_warranty: true, extra_fee: 40, labor_cost: 60 }));
    expect(r.serviceFee).toBe(0);
    expect(r.managerExtra).toBe(0);
    expect(r.eligibleBase).toBe(60);
    expect(r.technicianPayout).toBe(30);
  });

  it("materiais com quantidade > 1 entram na receita e não no repasse", () => {
    const mats = [{ material_cost: 50, supplier_cost: 30, quantity: 3, status: "approved" }];
    const r = computeServiceFinancialSummary(service({ labor_cost: 60 }), mats);
    expect(r.materials.clientTotal).toBe(150);
    expect(r.materials.supplierTotal).toBe(90);
    expect(r.totalRevenue).toBe(310); // 100 + 60 + 150
    expect(r.technicianPayout).toBe(80); // (100 + 60) × 50%
  });

  it("materiais pendentes do gestor já contam na receita do cliente", () => {
    const mats = [{ material_cost: 172.5, supplier_cost: 10, quantity: 1, status: "pending" }];
    const r = computeServiceFinancialSummary(service(), mats);
    expect(r.totalRevenue).toBe(272.5);
    expect(r.materials.profit).toBe(162.5);
  });

  it("WO3047555 (regra antiga) — material do técnico entra na receita e no lucro legado", () => {
    const mats = [{ material_cost: 172.5, supplier_cost: 10, quantity: 1, status: "approved" }];
    const r = computeServiceFinancialSummary(
      service({ created_at: OLD, reference: "WO3047555", labor_cost: 180, deslocacao_fee: 55, fixed_payout_amount: 21.2 }),
      mats,
    );
    expect(r.ruleVersion).toBe(FINANCIAL_RULES_VERSION_LEGACY);
    // 21.20 + 70% × 180 + 50% × (172.50 − 10 × 1.23) = 21.20 + 126 + 80.10
    expect(r.technicianPayout).toBe(227.3);
    expect(r.totalRevenue).toBe(407.5); // 55 + 180 + 172.50
  });

  it("desdobramento do repasse fecha exactamente no valor oficial gravado", () => {
    const b = computePayoutBreakdown(service({ labor_cost: 60, extra_fee: 40 }), [], [], 100);
    expect(b.total).toBe(100);
    expect(b.materialsShare).toBe(0);
    expect(Math.round((b.serviceFeeShare + b.laborShare + b.extraShare) * 100) / 100).toBe(100);
  });

  it("desdobramento sem valor gravado usa a fórmula", () => {
    const b = computePayoutBreakdown(service({ labor_cost: 60, extra_fee: 40 }));
    expect(b.serviceFeeShare).toBe(50);
    expect(b.laborShare).toBe(30);
    expect(b.extraShare).toBe(20);
    expect(b.total).toBe(100);
  });
});

