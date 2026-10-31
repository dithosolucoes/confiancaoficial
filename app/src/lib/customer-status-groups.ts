/**
 * Agrupa os estados do chamado para o cliente. Cada estado cai em exatamente
 * um grupo, e os contadores e as abas usam estas mesmas listas.
 */
export const CUSTOMER_PENDING_STATUSES = ["pending", "budgeting", "quote_sent", "payment_pending"] as const;
export const CUSTOMER_IN_PROGRESS_STATUSES = ["accepted", "in_progress", "quote_accepted", "quote_rejected"] as const;
export const CUSTOMER_DONE_STATUSES = ["completed", "cancelled"] as const;

export type CustomerGroup = "pending" | "in_progress" | "done" | "unknown";

export function customerStatusGroup(status: string): CustomerGroup {
  if ((CUSTOMER_PENDING_STATUSES as readonly string[]).includes(status)) return "pending";
  if ((CUSTOMER_IN_PROGRESS_STATUSES as readonly string[]).includes(status)) return "in_progress";
  if ((CUSTOMER_DONE_STATUSES as readonly string[]).includes(status)) return "done";
  return "unknown";
}
