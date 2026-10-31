import { describe, it, expect } from "vitest";
import { applyPartsMarkup, isValidPartsMarkup } from "@/lib/parts-markup";

describe("margem sobre peças", () => {
  it("soma o percentual ao custo", () => {
    expect(applyPartsMarkup(100, 15)).toBe(115);
    expect(applyPartsMarkup(22.5, 15)).toBe(25.88);
  });

  it("0% devolve o próprio custo e 100% dobra", () => {
    expect(applyPartsMarkup(40, 0)).toBe(40);
    expect(applyPartsMarkup(40, 100)).toBe(80);
  });

  it("custo zero ou inválido não gera valor", () => {
    expect(applyPartsMarkup(0, 15)).toBe(0);
    expect(applyPartsMarkup(-5, 15)).toBe(0);
    expect(applyPartsMarkup(NaN, 15)).toBe(0);
  });

  it("aceita só percentual entre 0 e 100", () => {
    expect(isValidPartsMarkup(0)).toBe(true);
    expect(isValidPartsMarkup(15.5)).toBe(true);
    expect(isValidPartsMarkup(100)).toBe(true);
    expect(isValidPartsMarkup(100.01)).toBe(false);
    expect(isValidPartsMarkup(-1)).toBe(false);
    expect(isValidPartsMarkup(NaN)).toBe(false);
  });
});
