import { describe, it, expect } from "vitest";
import { PAYOUT_DELAY_DAYS, payoutReleaseDate, isPayoutDue } from "@/lib/payout-timing";

const day = 24 * 60 * 60 * 1000;

describe("prazo de repasse ao técnico", () => {
  it("são 5 dias", () => {
    expect(PAYOUT_DELAY_DAYS).toBe(5);
  });

  it("libera 5 dias depois da conclusão", () => {
    const done = "2026-10-01T10:00:00.000Z";
    expect(payoutReleaseDate(done)?.getTime()).toBe(new Date(done).getTime() + 5 * day);
  });

  it("antes de 5 dias não está vencido; no 5º dia já está", () => {
    const done = new Date("2026-10-01T10:00:00.000Z");
    expect(isPayoutDue(done.toISOString(), new Date(done.getTime() + 4 * day))).toBe(false);
    expect(isPayoutDue(done.toISOString(), new Date(done.getTime() + 5 * day))).toBe(true);
  });

  it("serviço antigo sem data de conclusão conta como vencido", () => {
    expect(isPayoutDue(null)).toBe(true);
    expect(isPayoutDue(undefined)).toBe(true);
    expect(payoutReleaseDate(null)).toBeNull();
  });

  it("data inválida não bloqueia para sempre", () => {
    expect(isPayoutDue("não é data")).toBe(true);
  });
});
