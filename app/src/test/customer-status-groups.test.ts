import { describe, it, expect } from "vitest";
import { customerStatusGroup, CUSTOMER_PENDING_STATUSES, CUSTOMER_IN_PROGRESS_STATUSES, CUSTOMER_DONE_STATUSES } from "@/lib/customer-status-groups";

const ALL = ["pending","accepted","in_progress","budgeting","quote_sent","quote_accepted","quote_rejected","payment_pending","completed","cancelled"];

describe("customerStatusGroup", () => {
  it("cada estado cai em exatamente um grupo", () => {
    for (const s of ALL) {
      const hits = [CUSTOMER_PENDING_STATUSES, CUSTOMER_IN_PROGRESS_STATUSES, CUSTOMER_DONE_STATUSES].filter(g => (g as readonly string[]).includes(s));
      expect(hits.length, s).toBe(1);
    }
  });
  it("aceito (agendado) fica em andamento, não em pendentes", () => {
    expect(customerStatusGroup("accepted")).toBe("in_progress");
  });
  it("pagamento pendente e orçamento enviado ficam em pendentes", () => {
    expect(customerStatusGroup("payment_pending")).toBe("pending");
    expect(customerStatusGroup("quote_sent")).toBe("pending");
  });
  it("concluído e cancelado ficam em concluídos", () => {
    expect(customerStatusGroup("completed")).toBe("done");
    expect(customerStatusGroup("cancelled")).toBe("done");
  });
  it("estado desconhecido não entra em grupo nenhum", () => {
    expect(customerStatusGroup("xpto")).toBe("unknown");
  });
});
