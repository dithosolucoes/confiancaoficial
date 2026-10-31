import { describe, it, expect } from "vitest";
import {
  splitServiceCents,
  validateFinancialRule,
  eurosToCents,
  centsToEuros,
  DEFAULT_FINANCIAL_RULE,
} from "@/lib/financial-split";

describe("splitServiceCents", () => {
  it("regra padrão 50/50: visita €20 e M.O. €40", () => {
    const r = splitServiceCents({ visitFeeCents: 2000, laborCents: 4000, rule: DEFAULT_FINANCIAL_RULE });
    expect(r.visit).toEqual({ charged: 2000, technician: 1000, confianca: 1000, empresa: 0 });
    expect(r.labor).toEqual({ charged: 4000, technician: 2000, confianca: 2000, empresa: 0 });
    expect(r.clientTotal).toBe(6000);
    expect(r.technicianTotal).toBe(3000);
    expect(r.confiancaTotal).toBe(3000);
  });

  it("visita não cobrada zera a visita e não entra no total do cliente", () => {
    const r = splitServiceCents({
      visitFeeCents: 2000,
      laborCents: 4000,
      rule: { ...DEFAULT_FINANCIAL_RULE, visitCharged: false },
    });
    expect(r.visit).toEqual({ charged: 0, technician: 0, confianca: 0, empresa: 0 });
    expect(r.clientTotal).toBe(4000);
  });

  it("comissão 0% na M.O.: técnico fica com 100% da mão de obra", () => {
    const r = splitServiceCents({
      visitFeeCents: 0,
      laborCents: 10000,
      rule: { ...DEFAULT_FINANCIAL_RULE, laborConfiancaPct: 0 },
    });
    expect(r.labor.technician).toBe(10000);
    expect(r.labor.confianca).toBe(0);
  });

  it("nenhum centavo se perde em percentual com dízima (33.33%)", () => {
    const r = splitServiceCents({
      visitFeeCents: 1001,
      laborCents: 999,
      rule: { visitCharged: true, visitTechnicianPct: 33.33, laborConfiancaPct: 33.33 },
    });
    expect(r.technicianTotal + r.confiancaTotal).toBe(r.clientTotal);
    expect(r.visit.technician + r.visit.confianca).toBe(1001);
    expect(r.labor.technician + r.labor.confianca).toBe(999);
  });

  it("rejeita valores que não são centavos inteiros ou negativos", () => {
    expect(() => splitServiceCents({ visitFeeCents: 10.5, laborCents: 0, rule: DEFAULT_FINANCIAL_RULE })).toThrow();
    expect(() => splitServiceCents({ visitFeeCents: -1, laborCents: 0, rule: DEFAULT_FINANCIAL_RULE })).toThrow();
  });

  it("rejeita regra com percentual fora de 0–100", () => {
    expect(() =>
      splitServiceCents({ visitFeeCents: 100, laborCents: 0, rule: { ...DEFAULT_FINANCIAL_RULE, visitTechnicianPct: 101 } }),
    ).toThrow();
  });
});

describe("validateFinancialRule", () => {
  it("aceita regra válida e aponta cada campo inválido", () => {
    expect(validateFinancialRule(DEFAULT_FINANCIAL_RULE)).toEqual([]);
    expect(validateFinancialRule({ ...DEFAULT_FINANCIAL_RULE, visitTechnicianPct: -5 })).toHaveLength(1);
    expect(validateFinancialRule({ ...DEFAULT_FINANCIAL_RULE, laborConfiancaPct: NaN })).toHaveLength(1);
  });
});

describe("euros <-> centavos", () => {
  it("converte sem erro de ponto flutuante", () => {
    expect(eurosToCents(0.1 + 0.2)).toBe(30);
    expect(eurosToCents(12.5)).toBe(1250);
    expect(centsToEuros(1250)).toBe(12.5);
  });
});
