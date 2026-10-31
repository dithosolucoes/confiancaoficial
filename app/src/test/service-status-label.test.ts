import { describe, it, expect } from "vitest";
import { serviceStatusLabel } from "@/lib/service-status-label";

describe("serviceStatusLabel", () => {
  it("traduz os status do chamado para português", () => {
    expect(serviceStatusLabel("payment_pending")).toBe("Aguardando pagamento");
    expect(serviceStatusLabel("in_progress")).toBe("Em curso");
    expect(serviceStatusLabel("pending")).toBe("Aguardando despacho");
    expect(serviceStatusLabel("completed")).toBe("Concluído");
  });

  it("não deixa status desconhecido virar 'Em Curso' por engano", () => {
    expect(serviceStatusLabel("status_novo")).toBe("status_novo");
  });
});
