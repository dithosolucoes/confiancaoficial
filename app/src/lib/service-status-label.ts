export const SERVICE_STATUS_LABEL: Record<string, string> = {
  pending: "Aguardando despacho",
  accepted: "Aceite",
  in_progress: "Em curso",
  budgeting: "Em orçamento",
  quote_sent: "Orçamento enviado",
  quote_accepted: "Orçamento aceite",
  quote_rejected: "Orçamento recusado",
  payment_pending: "Aguardando pagamento",
  completed: "Concluído",
  cancelled: "Cancelado",
};

/** Texto em português para o status do chamado. Status desconhecido aparece como veio do banco. */
export function serviceStatusLabel(status: string): string {
  return SERVICE_STATUS_LABEL[status] ?? status;
}
