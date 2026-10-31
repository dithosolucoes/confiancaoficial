import { describe, it, expect } from "vitest";
import { parseSteps, stepsToText, MAX_SERVICE_STEPS, MAX_STEP_LENGTH } from "@/lib/service-types";

describe("parseSteps", () => {
  it("separa uma etapa por linha e ignora linhas vazias", () => {
    expect(parseSteps("Recebido\n\n  Lavando  \r\nEntregue\n")).toEqual(["Recebido", "Lavando", "Entregue"]);
  });

  it("devolve lista vazia para texto vazio ou só espaços", () => {
    expect(parseSteps("")).toEqual([]);
    expect(parseSteps("   \n  ")).toEqual([]);
  });

  it("limita a quantidade de etapas", () => {
    const many = Array.from({ length: MAX_SERVICE_STEPS + 5 }, (_, i) => `Etapa ${i + 1}`).join("\n");
    expect(parseSteps(many)).toHaveLength(MAX_SERVICE_STEPS);
  });

  it("corta etapas muito longas", () => {
    const [step] = parseSteps("x".repeat(MAX_STEP_LENGTH + 50));
    expect(step).toHaveLength(MAX_STEP_LENGTH);
  });
});

describe("stepsToText", () => {
  it("transforma a lista em texto com uma etapa por linha", () => {
    expect(stepsToText(["Recebido", "Entregue"])).toBe("Recebido\nEntregue");
  });

  it("ignora valores que não são texto e aceita dados inválidos", () => {
    expect(stepsToText(["ok", 3, null, "fim"])).toBe("ok\nfim");
    expect(stepsToText(null)).toBe("");
    expect(stepsToText("não é lista")).toBe("");
  });

  it("é o inverso de parseSteps para uma lista simples", () => {
    const steps = ["Diagnóstico", "Orçamento", "Reparo"];
    expect(parseSteps(stepsToText(steps))).toEqual(steps);
  });
});
