import { describe, it, expect } from "vitest";
import {
  findCatalogVatRate,
  vatRateFor,
  bookingFeeFor,
  bookingChargeFor,
  splitVat,
  DEFAULT_VAT_RATE,
  type CatalogVatRow,
} from "../../supabase/functions/_shared/pricing";
import { getVatPercent } from "@/lib/vat";

// Cópia do seed de public.appliance_types (supabase/migrations/20261028020000_platform_catalog_settings.sql),
// com os mesmos nomes exatos (espaços e barras incluídos).
const SEED: CatalogVatRow[] = [
  { name: "Frigorífico / Refrigerador / Arca", vat_rate: 6 },
  { name: "Máquina de Lavar Roupa", vat_rate: 6 },
  { name: "Lava e Seca", vat_rate: 6 },
  { name: "Micro-ondas", vat_rate: 6 },
  { name: "Placa  Indução / Vitrocerâmica", vat_rate: 6 },
  { name: "Forno", vat_rate: 6 },
  { name: "Lava-louças", vat_rate: 6 },
  { name: "Secadora", vat_rate: 6 },
  { name: "Forno Elétrico", vat_rate: 6 },
  { name: "Termocumulador reparação", vat_rate: 6 },
  { name: "Termocumulador instalação ( até 100 Lt )", vat_rate: 23 },
  { name: "Esquentador reparação", vat_rate: 6 },
  { name: "Esquentador instalação", vat_rate: 6 },
  { name: "Vistoria técnica / Seguradora", vat_rate: 23 },
  { name: "Instalação de torneira", vat_rate: 23 },
  { name: "Troca de torneira de Segurança", vat_rate: 23 },
  { name: "Substituição de Bichas da pia", vat_rate: 23 },
  { name: "Instalação de suporte de TV", vat_rate: 23 },
  { name: "Pendurar quadro", vat_rate: 23 },
  { name: "Reparação de quadro elétrico", vat_rate: 23 },
  { name: "Análise de curto circuito (Moradia)", vat_rate: 23 },
  { name: "Substituição de Disjuntor", vat_rate: 23 },
  { name: "Outro", vat_rate: 23 },
];

describe("taxa de IVA lida do catálogo (appliance_types.vat_rate)", () => {
  it("tipo com 6% no catálogo devolve 6%", () => {
    expect(vatRateFor("Micro-ondas", SEED)).toBe(0.06);
  });
  it("tipo com 23% no catálogo devolve 23%", () => {
    expect(vatRateFor("Instalação de torneira", SEED)).toBe(0.23);
  });
  it("ignora maiúsculas, acentos e espaços extras no nome", () => {
    expect(vatRateFor("  maquina de LAVAR roupa ", SEED)).toBe(0.06);
  });
  it("lê vat_rate vindo como texto do banco", () => {
    expect(vatRateFor("Forno", [{ name: "Forno", vat_rate: "6" }])).toBe(0.06);
  });
  it("tipo fora do catálogo: findCatalogVatRate devolve null", () => {
    expect(findCatalogVatRate("Aparelho inventado", SEED)).toBeNull();
  });
  it("tipo fora do catálogo: vatRateFor cai no padrão de 23%", () => {
    expect(vatRateFor("Aparelho inventado", SEED)).toBe(DEFAULT_VAT_RATE);
    expect(DEFAULT_VAT_RATE).toBe(0.23);
  });
  it("sem tipo: null e padrão de 23%", () => {
    expect(findCatalogVatRate(null, SEED)).toBeNull();
    expect(vatRateFor(undefined, SEED)).toBe(0.23);
  });
  it("catálogo vazio: padrão de 23%", () => {
    expect(vatRateFor("Forno", [])).toBe(0.23);
  });
  it("bate com o IVA do frontend (src/lib/vat.ts) para todo o seed", () => {
    for (const row of SEED) {
      expect(vatRateFor(row.name, SEED) * 100, row.name).toBe(getVatPercent(row.name));
    }
  });
});

describe("decomposição do IVA (total já inclui IVA)", () => {
  it("separa base e IVA a partir do total", () => {
    const s = splitVat(106, 0.06);
    expect(s.percent).toBe(6);
    expect(Number(s.base.toFixed(2))).toBe(100);
    expect(Number(s.vat.toFixed(2))).toBe(6);
  });
  it("não soma IVA: o total fica igual ao que entrou", () => {
    expect(splitVat(55, 0.23).total).toBe(55);
    expect(Number((splitVat(55, 0.23).base + splitVat(55, 0.23).vat).toFixed(2))).toBe(55);
  });
  it("23% sobre 55 dá base 44,72 e IVA 10,28", () => {
    const s = splitVat(55, 0.23);
    expect(Number(s.base.toFixed(2))).toBe(44.72);
    expect(Number(s.vat.toFixed(2))).toBe(10.28);
  });
});

describe("valor da visita cobrado ao cliente", () => {
  it("usa a taxa cadastrada no tipo de serviço", () => {
    expect(bookingFeeFor({ appliance_type: "Forno", deslocacao_fee: 60 })).toEqual({ total: 60, source: "taxa_tipo" });
  });
  it("taxa em texto vinda do banco também vale", () => {
    expect(bookingFeeFor({ appliance_type: "Forno", deslocacao_fee: "70.50" }).total).toBe(70.5);
  });
  it("sem taxa cadastrada (vazia): padrão por aparelho", () => {
    expect(bookingFeeFor({ appliance_type: "Forno", deslocacao_fee: null })).toEqual({ total: 55, source: "padrao_aparelho" });
  });
  it("taxa zero conta como sem taxa", () => {
    expect(bookingFeeFor({ appliance_type: "Forno", deslocacao_fee: 0 }).total).toBe(55);
  });
  it("padrões por aparelho: 85 reparação de esquentador e vistoria, 75 instalação de esquentador", () => {
    expect(bookingFeeFor({ appliance_type: "Esquentador reparação" }).total).toBe(85);
    expect(bookingFeeFor({ appliance_type: "Vistoria técnica / Seguradora" }).total).toBe(85);
    expect(bookingFeeFor({ appliance_type: "Esquentador instalação" }).total).toBe(75);
  });
  it("sem tipo de aparelho nem taxa: 55", () => {
    expect(bookingFeeFor({}).total).toBe(55);
  });
});

describe("cobrança da visita: garantia e tipo sem visita", () => {
  it("garantia não cobra visita, mesmo com taxa cadastrada", () => {
    expect(bookingChargeFor({ appliance_type: "Forno", deslocacao_fee: 60, is_warranty: true }).total).toBe(0);
  });
  it("tipo marcado como sem visita (regra gravada no chamado) não cobra", () => {
    expect(bookingChargeFor({ appliance_type: "Forno", deslocacao_fee: 60, financial_rule_snapshot: { visit_charged: false } }).total).toBe(0);
  });
  it("visita normal cobra a taxa do tipo", () => {
    expect(bookingChargeFor({ appliance_type: "Forno", deslocacao_fee: 60, is_warranty: false, financial_rule_snapshot: { visit_charged: true } }).total).toBe(60);
  });
  it("chamado antigo sem snapshot cobra normalmente", () => {
    expect(bookingChargeFor({ appliance_type: "Forno", deslocacao_fee: null, financial_rule_snapshot: null }).total).toBe(55);
  });
});
