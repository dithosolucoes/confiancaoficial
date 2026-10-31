/**
 * Margem sobre peças: valor cobrado ao cliente = custo da peça + percentual do gestor.
 * O banco recalcula o mesmo valor ao gravar (trigger apply_parts_markup); este cálculo
 * serve para mostrar a prévia no formulário do técnico.
 */

export const PARTS_MARKUP_DEFAULT_PCT = 15;

/** Valor para o cliente em euros, arredondado a 2 casas (em centavos, sem erro de float). */
export const applyPartsMarkup = (supplierCost: number, pct: number): number => {
  if (!Number.isFinite(supplierCost) || supplierCost <= 0) return 0;
  const cents = Math.round(supplierCost * 100);
  const saleCents = Math.round((cents * (100 + pct)) / 100);
  return saleCents / 100;
};

/** Percentual válido para o gestor: número entre 0 e 100. */
export const isValidPartsMarkup = (pct: number): boolean =>
  Number.isFinite(pct) && pct >= 0 && pct <= 100;
