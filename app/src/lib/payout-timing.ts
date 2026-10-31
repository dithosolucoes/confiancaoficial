/**
 * Prazo de repasse ao técnico (regra confirmada pelo cliente, 30/10/2026):
 * o pagamento sai 5 dias após a conclusão do serviço, se tudo estiver certo.
 * Serviços antigos sem data de conclusão são tratados como vencidos.
 */

export const PAYOUT_DELAY_DAYS = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Data em que o serviço passa a ser elegível para repasse, ou null se não há conclusão. */
export const payoutReleaseDate = (completedAt: string | null | undefined): Date | null => {
  if (!completedAt) return null;
  const base = new Date(completedAt);
  if (Number.isNaN(base.getTime())) return null;
  return new Date(base.getTime() + PAYOUT_DELAY_DAYS * DAY_MS);
};

/** true quando o prazo de 5 dias já passou (ou não há data de conclusão registrada). */
export const isPayoutDue = (completedAt: string | null | undefined, now: Date = new Date()): boolean => {
  const release = payoutReleaseDate(completedAt);
  return !release || release.getTime() <= now.getTime();
};
