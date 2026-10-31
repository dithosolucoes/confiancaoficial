// Lista de Tipos de Serviço com IVA reduzido de 6%.
// Todos os restantes Tipos de Serviço utilizam IVA padrão de 23%.
export const VAT_REDUCED_TYPES: readonly string[] = [
  "Frigorífico",
  "Refrigerador",
  "Arca",
  "Máquina de Lavar Roupa",
  "Lava e Seca",
  "Micro-ondas",
  "Placa Indução",
  "Placa Vitrocerâmica",
  "Forno",
  "Lava-louças",
  "Secadora",
  "Forno Elétrico",
  "Termocumulador reparação",
  "Termocumulador instalação (até 100 Lt)",
  "Esquentador reparação",
  "Esquentador instalação",
];

const normalize = (s?: string | null) =>
  (s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const REDUCED_NORMALIZED = new Set(VAT_REDUCED_TYPES.map(normalize));

/**
 * Devolve a taxa de IVA aplicável (0.06 ou 0.23) com base no Tipo de Serviço.
 * Por defeito (tipo desconhecido) usa IVA padrão de 23%.
 */
export const getVatRate = (applianceType?: string | null): number => {
  if (!applianceType) return 0.23;
  const norm = normalize(applianceType);
  // Match exato
  if (REDUCED_NORMALIZED.has(norm)) return 0.06;
  // Match por segmento (ex.: "Frigorífico / Refrigerador / Arca")
  const segments = norm.split(/[/,+|;•·]| e | & /).map((s) => s.trim()).filter(Boolean);
  if (segments.some((seg) => REDUCED_NORMALIZED.has(seg))) return 0.06;
  // Match por substring (qualquer tipo reduzido contido no texto)
  for (const reduced of REDUCED_NORMALIZED) {
    if (reduced && norm.includes(reduced)) return 0.06;
  }
  return 0.23;
};

/** Devolve a taxa de IVA em percentagem (6 ou 23). */
export const getVatPercent = (applianceType?: string | null): number =>
  Math.round(getVatRate(applianceType) * 100);

export interface VatSplit {
  total: number; // valor introduzido (já inclui IVA)
  base: number;  // valor sem IVA (base tributável)
  vat: number;   // montante de IVA incluído
  rate: number;  // taxa aplicada (0.06 / 0.23)
  percent: number; // taxa em % (6 / 23)
}

/**
 * Decompõe um total que já inclui IVA em base + IVA.
 * Não soma IVA — apenas separa as componentes a partir do total introduzido.
 */
export const splitVat = (totalWithVat: number, rate: number): VatSplit => {
  const total = Number(totalWithVat || 0);
  const r = Number(rate || 0);
  const base = r > 0 ? total / (1 + r) : total;
  const vat = total - base;
  return { total, base, vat, rate: r, percent: Math.round(r * 100) };
};

/** Conveniência: decompor a partir do Tipo de Serviço. */
export const splitVatByType = (totalWithVat: number, applianceType?: string | null): VatSplit =>
  splitVat(totalWithVat, getVatRate(applianceType));
