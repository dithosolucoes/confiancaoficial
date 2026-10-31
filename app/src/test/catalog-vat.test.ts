import { describe, it, expect } from "vitest";
import { getVatPercent } from "@/lib/vat";

// Espelho do seed de public.appliance_types (supabase/migrations/20261028020000_platform_catalog_settings.sql).
// Se o seed mudar, este teste tem que mudar junto: é o contrato entre o catálogo e o IVA calculado no frontend.
const CATALOG_SEED: Array<[string, number]> = [
  ["Frigorífico / Refrigerador / Arca", 6],
  ["Máquina de Lavar Roupa", 6],
  ["Lava e Seca", 6],
  ["Micro-ondas", 6],
  ["Placa  Indução / Vitrocerâmica", 6],
  ["Forno", 6],
  ["Lava-louças", 6],
  ["Secadora", 6],
  ["Forno Elétrico", 6],
  ["Termocumulador reparação", 6],
  ["Termocumulador instalação ( até 100 Lt )", 23],
  ["Esquentador reparação", 6],
  ["Esquentador instalação", 6],
  ["Vistoria técnica / Seguradora", 23],
  ["Instalação de torneira", 23],
  ["Troca de torneira de Segurança", 23],
  ["Substituição de Bichas da pia", 23],
  ["Instalação de suporte de TV", 23],
  ["Pendurar quadro", 23],
  ["Reparação de quadro elétrico", 23],
  ["Análise de curto circuito (Moradia)", 23],
  ["Substituição de Disjuntor", 23],
  ["Outro", 23],
];

describe("catálogo de tipos de aparelho × IVA calculado no frontend", () => {
  it.each(CATALOG_SEED)("%s → %i%%", (name, rate) => {
    expect(getVatPercent(name)).toBe(rate);
  });
});
