import { describe, expect, it } from "vitest";
import { z } from "zod";
import { toStrictJsonSchema } from "../to-strict-json-schema";
import { buildCrossFileAnalysisResponseSchema } from "../../schemas/cross-file.schema";
import { CaseAnalysisSchema } from "../../schemas/case-analysis.schema";
import { ScratchpadContentSchema } from "../../schemas/scratchpad.schema";

const crossFileStrict = toStrictJsonSchema(
  z.toJSONSchema(
    buildCrossFileAnalysisResponseSchema({
      legalIssueIds: ["LI-1"],
      scratchpadIds: ["SP-1"],
      evidenceIds: ["EV-1"],
      hasOpposingHoldings: false,
    }),
    { target: "draft-7" },
  ),
);

const analysisNode = (crossFileStrict as any).properties.analyses.items;

function collect(node: any, visit: (node: any) => void): void {
  if (Array.isArray(node)) return node.forEach((item) => collect(item, visit));
  if (!node || typeof node !== "object") return;
  visit(node);
  Object.values(node).forEach((child) => collect(child, visit));
}

describe("toStrictJsonSchema — subconjunto estrito da OpenAI", () => {
  it("puts every property of every object in required", () => {
    collect(crossFileStrict, (node) => {
      if (!node.properties) return;
      expect(new Set(node.required)).toEqual(new Set(Object.keys(node.properties)));
    });
  });

  it("closes every object with additionalProperties: false", () => {
    collect(crossFileStrict, (node) => {
      if (node.properties) expect(node.additionalProperties).toBe(false);
    });
  });

  it("strips keywords the strict subset rejects, which would fail the whole request", () => {
    const forbidden = ["$schema", "default", "minItems", "minLength", "maxItems", "format", "pattern"];
    collect(crossFileStrict, (node) => {
      for (const keyword of forbidden) expect(node).not.toHaveProperty(keyword);
    });
  });

  it("turns the optional chamberPattern into a nullable required field", () => {
    expect(analysisNode.required).toContain("chamberPattern");
    expect(analysisNode.properties.chamberPattern.type).toEqual(["string", "null"]);
  });

  it("keeps sampleCoverage as an enum even though its default was stripped", () => {
    expect(analysisNode.properties.sampleCoverage.enum).toEqual(["COVERED", "NOT_COVERED"]);
    expect(analysisNode.properties.sampleCoverage).not.toHaveProperty("default");
  });

  it("keeps the list fields typed as arrays — the guarantee that fixes the shape errors", () => {
    for (const field of ["strongestSupporting", "strongestOpposing", "supportingDecisions", "risks"]) {
      expect(analysisNode.properties[field].type).toBe("array");
    }
  });

  it("does not make an already-required field nullable", () => {
    expect(analysisNode.properties.conclusion.type).toBe("string");
  });
});

/**
 * O modo estrito vale para as quatro etapas que chamam `generateStructuredWithRetry`, e a API
 * recusa a requisição INTEIRA (HTTP 400) ao encontrar uma keyword fora do subconjunto ou um campo
 * fora de `required`. Sem esta auditoria, um `.min(1)` ou um `.optional()` novo em qualquer um
 * desses schemas só apareceria como erro em produção, na primeira chamada real.
 */
describe("toStrictJsonSchema — todos os schemas de LLM do pipeline", () => {
  const UNSUPPORTED = [
    "$schema", "default", "minItems", "maxItems", "minLength",
    "maxLength", "format", "pattern", "minimum", "maximum", "uniqueItems",
  ];

  const schemas: [string, z.ZodType<unknown>][] = [
    ["CaseAnalysis", CaseAnalysisSchema],
    ["Scratchpad", ScratchpadContentSchema],
    ["CrossFileAnalysis", buildCrossFileAnalysisResponseSchema({
      legalIssueIds: ["LI-1"], scratchpadIds: ["SP-1"], evidenceIds: ["EV-1"], hasOpposingHoldings: false,
    })],
  ];

  it.each(schemas)("keeps %s inside the strict subset and its limits", (_name, schema) => {
    const strict = toStrictJsonSchema(z.toJSONSchema(schema, { target: "draft-7" }));
    let properties = 0;
    let depth = 0;

    collect(strict, (node) => {
      for (const keyword of UNSUPPORTED) expect(node).not.toHaveProperty(keyword);
      if (!node.properties) return;
      expect(new Set(node.required)).toEqual(new Set(Object.keys(node.properties)));
      expect(node.additionalProperties).toBe(false);
      properties += Object.keys(node.properties).length;
    });

    const measure = (node: any, level: number): void => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) return node.forEach((item) => measure(item, level));
      const next = node.properties ? level + 1 : level;
      if (node.properties) depth = Math.max(depth, level);
      Object.values(node).forEach((child) => measure(child, next));
    };
    measure(strict, 1);

    // Limites do modo estrito da OpenAI: no máximo 100 propriedades e 5 níveis de aninhamento.
    expect(properties).toBeLessThanOrEqual(100);
    expect(depth).toBeLessThanOrEqual(5);
  });
});
