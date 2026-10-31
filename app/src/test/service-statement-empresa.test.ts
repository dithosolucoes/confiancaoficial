import { describe, it, expect } from "vitest";
import { buildServiceStatement } from "@/lib/service-statement";

const base = {
  created_at: "2026-10-30T10:00:00Z",
  appliance_type: "Máquina de Lavar Roupa",
  deslocacao_fee: 60,
  labor_cost: 100,
  extra_fee: 0,
  status: "completed",
};
const snap = { visit_technician_pct: 50, labor_confianca_pct: 50, visit_charged: true, visit_empresa_pct: 10, labor_empresa_pct: 20 };

describe("extrato do serviço com empresa parceira", () => {
  it("chamado da empresa: técnico 54, empresa 26, Confiança 80, e a soma bate com o cliente (160)", () => {
    const st = buildServiceStatement({ ...base, assigned_company_id: "c1", financial_rule_snapshot: snap });
    expect(st.technicianTotal).toBe(54);
    expect(st.empresaTotal).toBe(26);
    expect(st.confiancaTotal).toBe(80);
    expect(st.empresaVisit).toBe(6);
    expect(st.empresaLabor).toBe(20);
    expect(st.technicianTotal + st.empresaTotal + st.confiancaTotal).toBeCloseTo(st.clientTotal, 2);
  });

  it("chamado sem empresa: empresa zero e técnico 80", () => {
    const st = buildServiceStatement({ ...base, assigned_company_id: null, financial_rule_snapshot: snap });
    expect(st.empresaTotal).toBe(0);
    expect(st.technicianTotal).toBe(80);
  });
});
