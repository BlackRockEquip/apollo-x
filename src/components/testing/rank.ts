import { templateMatchesModel } from "@/lib/testing/spec";

// Templates that fit a machine model first, so the right sheet is the first choice. Kept apart from the server code so the browser can use it.
export function rankTemplatesForModel<T extends { machineModels: readonly string[] }>(templates: readonly T[], model: string): T[] {
  return [...templates].sort((a, b) => Number(templateMatchesModel(b, model)) - Number(templateMatchesModel(a, model)));
}
