/**
 * Motor Fiscal Centralizado — Autoridade Tributária de Portugal
 * Regras de IVA vigentes:
 * - Taxa Reduzida (6%): Eletrodomésticos essenciais de frio/cozinha e serviços com mão de obra de reparação qualificada
 * - Taxa Normal (23%): Aparelhos de ar condicionado, eletrônicos, peças e serviços gerais
 */

export { getVatRate, getVatPercent, splitVat, VAT_REDUCED_TYPES } from "@/lib/vat";
import { getVatRate, splitVat } from "@/lib/vat";

export interface VatCalculationResult {
  grossAmount: number;
  netAmount: number;
  vatAmount: number;
  vatRate: number;       // 0.06 ou 0.23
  vatPercentText: string; // "6%" ou "23%"
}

export const getVatRateForAppliance = (applianceType: string | null | undefined): number => {
  return getVatRate(applianceType);
};

export const calculateVatFromGross = (grossAmount: number, vatRate: number): VatCalculationResult => {
  const safeGross = Math.max(0, Number(grossAmount) || 0);
  const split = splitVat(safeGross, vatRate);

  return {
    grossAmount: split.total,
    netAmount: split.base,
    vatAmount: split.vat,
    vatRate: split.rate,
    vatPercentText: `${split.percent}%`,
  };
};

export const calculateVatFromNet = (netAmount: number, vatRate: number): VatCalculationResult => {
  const safeNet = Math.max(0, Number(netAmount) || 0);
  const vatAmount = Number((safeNet * vatRate).toFixed(2));
  const grossAmount = Number((safeNet + vatAmount).toFixed(2));

  return {
    grossAmount,
    netAmount: safeNet,
    vatAmount,
    vatRate,
    vatPercentText: `${Math.round(vatRate * 100)}%`,
  };
};
