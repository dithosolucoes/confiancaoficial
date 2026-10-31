export const MAX_SERVICE_STEPS = 20;
export const MAX_STEP_LENGTH = 120;

/** Converte o texto digitado pelo gestor (uma etapa por linha) na lista que vai para o banco. */
export function parseSteps(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, MAX_SERVICE_STEPS)
    .map((line) => line.slice(0, MAX_STEP_LENGTH));
}

/** Converte a lista guardada no banco de volta para o texto editável (uma etapa por linha). */
export function stepsToText(steps: unknown): string {
  if (!Array.isArray(steps)) return "";
  return steps.filter((step): step is string => typeof step === "string").join("\n");
}
