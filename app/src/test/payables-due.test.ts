import { describe, it, expect } from "vitest";
import {
  dueWithinDays,
  daysBetween,
  localISODate,
  remainingOf,
  dueLabelPt,
  type DuePayable,
} from "@/lib/payables-due";

const HOJE = "2026-10-30";
const p = (over: Partial<DuePayable> & { id: string; due_date: string }): DuePayable => ({
  description: `Conta ${over.id}`,
  supplier_name: "Fornecedor",
  total_amount: 100,
  paid_amount: 0,
  status: "pendente",
  ...over,
});

describe("datas", () => {
  it("dias entre datas: mesmo dia, 7 dias, virada de ano, ano bissexto e negativo", () => {
    expect(daysBetween("2026-10-30", "2026-10-30")).toBe(0);
    expect(daysBetween("2026-10-30", "2026-11-06")).toBe(7);
    expect(daysBetween("2026-12-29", "2027-01-05")).toBe(7);
    expect(daysBetween("2028-02-25", "2028-03-03")).toBe(7);
    expect(daysBetween("2026-10-30", "2026-10-29")).toBe(-1);
  });

  it("data local: 00:30 do dia 30 continua a ser dia 30", () => {
    expect(localISODate(new Date(2026, 9, 30, 0, 30))).toBe("2026-10-30");
    expect(localISODate(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});

describe("saldo em aberto", () => {
  it("total menos pago", () => {
    expect(remainingOf({ total_amount: 100, paid_amount: 40 })).toBe(60);
  });
  it("pago a mais não dá saldo negativo", () => {
    expect(remainingOf({ total_amount: 100, paid_amount: 120 })).toBe(0);
  });
});

describe("regra 'vence em até 7 dias'", () => {
  it("inclui hoje e o dia 7 (limite inclusive)", () => {
    const r = dueWithinDays([p({ id: "a", due_date: HOJE }), p({ id: "b", due_date: "2026-11-06" })], HOJE);
    expect(r.map((x) => x.item.id)).toEqual(["a", "b"]);
    expect(r.map((x) => x.daysLeft)).toEqual([0, 7]);
  });

  it("exclui o dia 8 e as já vencidas", () => {
    const r = dueWithinDays(
      [p({ id: "oito", due_date: "2026-11-07" }), p({ id: "ontem", due_date: "2026-10-29" })],
      HOJE,
    );
    expect(r).toEqual([]);
  });

  it("exclui pagas e canceladas mesmo com vencimento hoje", () => {
    const r = dueWithinDays(
      [p({ id: "paga", due_date: HOJE, status: "pago", paid_amount: 100 }), p({ id: "canc", due_date: HOJE, status: "cancelado" })],
      HOJE,
    );
    expect(r).toEqual([]);
  });

  it("exclui quem já está totalmente coberto, mesmo com status pendente", () => {
    const r = dueWithinDays([p({ id: "coberta", due_date: HOJE, total_amount: 50, paid_amount: 50 })], HOJE);
    expect(r).toEqual([]);
  });

  it("inclui parcialmente paga e devolve só o saldo em aberto", () => {
    const r = dueWithinDays([p({ id: "parcial", due_date: "2026-11-02", status: "parcialmente_pago", total_amount: 100, paid_amount: 30 })], HOJE);
    expect(r).toHaveLength(1);
    expect(r[0].remaining).toBe(70);
    expect(r[0].daysLeft).toBe(3);
  });

  it("ordena pelo prazo, do mais próximo para o mais longe", () => {
    const r = dueWithinDays(
      [p({ id: "c", due_date: "2026-11-05" }), p({ id: "a", due_date: HOJE }), p({ id: "b", due_date: "2026-11-02" })],
      HOJE,
    );
    expect(r.map((x) => x.item.id)).toEqual(["a", "b", "c"]);
  });

  it("aceita outro limite de dias", () => {
    // 30/out -> 2/nov = 3 dias (entra); 30/out -> 3/nov = 4 dias (fica de fora)
    const r = dueWithinDays([p({ id: "x", due_date: "2026-11-02" })], HOJE, 3);
    expect(r).toHaveLength(1);
    expect(dueWithinDays([p({ id: "y", due_date: "2026-11-03" })], HOJE, 3)).toEqual([]);
  });

  it("não altera a lista de entrada", () => {
    const entrada = [p({ id: "a", due_date: "2026-11-05" }), p({ id: "b", due_date: HOJE })];
    const antes = entrada.map((x) => x.id).join(",");
    dueWithinDays(entrada, HOJE);
    expect(entrada.map((x) => x.id).join(",")).toBe(antes);
  });
});

describe("texto do prazo", () => {
  it("hoje, amanhã e em N dias", () => {
    expect(dueLabelPt(0)).toBe("hoje");
    expect(dueLabelPt(1)).toBe("amanhã");
    expect(dueLabelPt(5)).toBe("em 5 dias");
  });
});
