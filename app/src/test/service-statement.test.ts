import { describe, it, expect } from "vitest";
import { buildServiceStatement } from "@/lib/service-statement";
import { computeServiceFinancials } from "@/lib/financial-rules";

const base = {
  created_at: "2026-10-30T10:00:00Z",
  appliance_type: "Máquina de Lavar Roupa",
  deslocacao_fee: 55,
  labor_cost: 100,
  extra_fee: 0,
  status: "completed",
};
const snap = (vt: number, lc: number, vc = true) => ({ visit_technician_pct: vt, labor_confianca_pct: lc, visit_charged: vc });

describe("buildServiceStatement", () => {
  it("padrão 50/50: cliente paga 155, técnico 77.50, Confiança 77.50", () => {
    const s = buildServiceStatement(base);
    expect(s.clientTotal).toBe(155);
    expect(s.technicianTotal).toBe(77.5);
    expect(s.confiancaTotal).toBe(77.5);
    expect(s.usesSnapshot).toBe(false);
  });

  it("técnico + Confiança sempre fecham o valor cobrado", () => {
    for (const sn of [snap(40, 50), snap(50, 30), snap(33.33, 33.33), snap(50, 50, false)]) {
      const s = buildServiceStatement({ ...base, extra_fee: 30, financial_rule_snapshot: sn });
      expect(Math.round((s.technicianTotal + s.confiancaTotal) * 100)).toBe(Math.round(s.clientTotal * 100));
    }
  });

  it("técnico recebe o mesmo que computeServiceFinancials (sem garantia)", () => {
    const cases = [
      { ...base },
      { ...base, financial_rule_snapshot: snap(40, 50) },
      { ...base, financial_rule_snapshot: snap(50, 30) },
      { ...base, financial_rule_snapshot: snap(50, 50, false) },
      { ...base, labor_cost: 0, quote_status: "rejected", financial_rule_snapshot: snap(40, 50) },
      { ...base, extra_fee: 30, financial_rule_snapshot: snap(50, 50) },
    ];
    for (const c of cases) {
      expect(buildServiceStatement(c).technicianTotal).toBe(computeServiceFinancials(c).technicianPayout);
    }
  });

  it("visita não cobrada: cliente paga só a M.O.", () => {
    const s = buildServiceStatement({ ...base, financial_rule_snapshot: snap(50, 50, false) });
    expect(s.visitCharged).toBe(0);
    expect(s.clientTotal).toBe(100);
  });

  it("serviço cancelado não tem valores", () => {
    const s = buildServiceStatement({ ...base, status: "cancelled" });
    expect(s.clientTotal).toBe(0);
    expect(s.technicianTotal).toBe(0);
    expect(s.confiancaTotal).toBe(0);
  });

  it("marca se usou a regra gravada no chamado", () => {
    expect(buildServiceStatement({ ...base, financial_rule_snapshot: snap(40, 50) }).usesSnapshot).toBe(true);
  });
});
