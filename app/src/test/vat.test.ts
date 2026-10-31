import { describe, it, expect } from "vitest";
import { getVatPercent } from "@/lib/vat";

// Trava de regressão: achado real nesta rodada — os nomes de aparelho usados
// na reserva rápida da Index.tsx (APPLIANCES_LIST) não batiam com
// VAT_REDUCED_TYPES e caíam, incorretamente, no IVA de 23% em vez de 6%.
// Este teste garante que os nomes corrigidos continuam a bater.
describe("getVatPercent — nomes usados em APPLIANCES_LIST (Index.tsx)", () => {
  it("Frigorífico / Refrigerador / Arca → 6%", () => {
    expect(getVatPercent("Frigorífico / Refrigerador / Arca")).toBe(6);
  });

  it("Máquina de Lavar Roupa → 6%", () => {
    expect(getVatPercent("Máquina de Lavar Roupa")).toBe(6);
  });

  it("Secadora de Roupa → 6%", () => {
    expect(getVatPercent("Secadora de Roupa")).toBe(6);
  });

  it("Lava-louças → 6%", () => {
    expect(getVatPercent("Lava-louças")).toBe(6);
  });

  it("Forno / Placa Indução / Placa Vitrocerâmica → 6%", () => {
    expect(getVatPercent("Forno / Placa Indução / Placa Vitrocerâmica")).toBe(6);
  });

  it("Termocumulador reparação / Esquentador reparação → 6%", () => {
    expect(getVatPercent("Termocumulador reparação / Esquentador reparação")).toBe(6);
  });

  it("Micro-ondas e Pequenos Aparelhos → 6%", () => {
    expect(getVatPercent("Micro-ondas e Pequenos Aparelhos")).toBe(6);
  });

  it("Outro Aparelho / Reparação Geral → 23% (sem correspondência, padrão)", () => {
    expect(getVatPercent("Outro Aparelho / Reparação Geral")).toBe(23);
  });

  it("nomes antigos, incorretos, continuam a documentar o bug original se reintroduzidos", () => {
    // Estes eram os nomes ANTES da correção — ficavam (incorretamente) a 23%.
    // Mantido aqui só como documentação do que foi corrigido, não como meta.
    expect(getVatPercent("Máquina de Secar Roupa")).toBe(23);
    expect(getVatPercent("Máquina de Lavar Loiça")).toBe(23);
    expect(getVatPercent("Termoacumulador / Esquentador")).toBe(23);
  });
});
