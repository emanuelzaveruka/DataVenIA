import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GLOSSARY, PROGRESS_GLOSSARY_KEYS, type GlossaryEntry, type GlossaryKey } from "../glossary";

// `as const satisfies` deixa cada entrada com o tipo dos seus próprios literais, então os campos
// opcionais não existem na união. Percorrer o glossário exige a forma larga do contrato.
const entries = Object.entries(GLOSSARY) as [GlossaryKey, GlossaryEntry][];
import { buildPipelineProgress } from "../../observability/pipeline-progress";

const DOC_PATH = join(process.cwd(), "public", "como-funciona.html");

/**
 * O glossário é lido em três lugares (painel de progresso, relatório e o PDF de
 * `public/como-funciona.html`). Estes testes existem para que os três não divirjam em silêncio: uma
 * explicação que descreve uma etapa que não existe mais é pior do que etapa sem explicação.
 */
describe("glossário de ajuda contextual", () => {
  it("nomeia exatamente as oito etapas do progresso, na mesma ordem", () => {
    const labels = buildPipelineProgress({}).map((step) => step.label);
    const terms = PROGRESS_GLOSSARY_KEYS.map((key) => GLOSSARY[key].term);

    expect(terms).toEqual(labels);
  });

  it("explica o que 'zero' significa em toda etapa que mostra contagem", () => {
    const countedSteps = buildPipelineProgress({}).map((step, index) => ({
      key: PROGRESS_GLOSSARY_KEYS[index]!,
      hasCount: "count" in step,
    }));

    for (const { key, hasCount } of countedSteps) {
      if (!hasCount) continue;
      const entry: GlossaryEntry = GLOSSARY[key];
      expect(entry.empty, `${key} precisa dizer o que significa terminar com zero`).toBeTruthy();
    }
  });

  it("nunca apresenta um número como chance de êxito (§3.10/HU-29)", () => {
    // Só a *métrica* é proibida, não a palavra: metade das entradas existe justamente para dizer
    // que o produto não estima êxito, e uma regra que casasse "probabilidade de êxito" reprovaria
    // a frase que nega a probabilidade.
    const forbidden = /\d\s*%|chance de (ganhar|vit[óo]ria|êxito)/i;

    for (const [key, entry] of entries) {
      const text = [entry.what, entry.empty, entry.pending, entry.failed].filter(Boolean).join(" ");
      expect(forbidden.test(text), `${key} expressa métrica proibida`).toBe(false);
    }
  });

  it("tem todo termo documentado em public/como-funciona.html", () => {
    const doc = readFileSync(DOC_PATH, "utf8");

    for (const [key, entry] of entries) {
      expect(doc.includes(entry.term), `"${entry.term}" (${key}) não aparece na documentação`).toBe(
        true,
      );
    }
  });
});
