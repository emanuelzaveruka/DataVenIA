import { describe, expect, it } from "vitest";
import { z } from "zod";
import { normalizeModelOutput } from "../normalize-model-output";

const schema = z.object({
  analyses: z.array(
    z.object({
      id: z.string(),
      tags: z.array(z.string()),
      chamberPattern: z.string().optional(),
      risks: z.array(z.object({ description: z.string(), evidenceIds: z.array(z.string()).min(1) })),
    }),
  ),
});

function normalize(raw: unknown) {
  return normalizeModelOutput(schema, raw);
}

describe("normalizeModelOutput — degradação sintática", () => {
  it("wraps a scalar into an array where the schema expects a list", () => {
    const { value, repairs } = normalize({ analyses: [{ id: "A", tags: "unica", risks: [] }] });

    expect((value as any).analyses[0].tags).toEqual(["unica"]);
    expect(repairs).toHaveLength(1);
    expect(repairs[0]!.path).toBe("analyses.0.tags");
    expect(repairs[0]!.kind).toBe("SCALAR_TO_ARRAY");
  });

  it("wraps a lone object into an array of objects and keeps normalizing inside it", () => {
    const { value } = normalize({
      analyses: [{ id: "A", tags: [], risks: { description: "R", evidenceIds: "EV-1" } }],
    });

    expect((value as any).analyses[0].risks).toEqual([{ description: "R", evidenceIds: ["EV-1"] }]);
  });

  it("wraps the array itself when the model sends a single object at the top", () => {
    const { value } = normalize({ analyses: { id: "A", tags: [], risks: [] } });
    expect((value as any).analyses).toHaveLength(1);
  });

  it("drops an explicit null on an optional field, which is how strict json_schema says 'unknown'", () => {
    const { value, repairs } = normalize({
      analyses: [{ id: "A", tags: [], chamberPattern: null, risks: [] }],
    });

    expect("chamberPattern" in (value as any).analyses[0]).toBe(false);
    expect(repairs[0]!.kind).toBe("NULL_TO_ABSENT");
    expect(schema.safeParse(value).success).toBe(true);
  });

  it("reports nothing and changes nothing when the output is already well formed", () => {
    const raw = { analyses: [{ id: "A", tags: ["x"], risks: [{ description: "R", evidenceIds: ["EV-1"] }] }] };
    const { value, repairs } = normalize(raw);

    expect(repairs).toEqual([]);
    expect(value).toEqual(raw);
  });
});

describe("normalizeModelOutput — nunca repara conteúdo", () => {
  it("leaves an empty array empty, so the min(1) rule still rejects it (HU-23)", () => {
    const { value, repairs } = normalize({
      analyses: [{ id: "A", tags: [], risks: [{ description: "R", evidenceIds: [] }] }],
    });

    expect((value as any).analyses[0].risks[0].evidenceIds).toEqual([]);
    expect(repairs).toEqual([]);
    expect(schema.safeParse(value).success).toBe(false);
  });

  it("leaves null on a required array untouched — 'unknown' and 'empty' are different claims", () => {
    const { value, repairs } = normalize({ analyses: [{ id: "A", tags: null, risks: [] }] });

    expect((value as any).analyses[0].tags).toBeNull();
    expect(repairs).toEqual([]);
  });

  it("never invents or rewrites an identifier", () => {
    const { value } = normalize({ analyses: [{ id: "SP-INEXISTENTE", tags: "x", risks: [] }] });
    expect((value as any).analyses[0].id).toBe("SP-INEXISTENTE");
  });

  it("keeps superRefine rules in force over the normalized value", () => {
    const refined = z
      .object({ tags: z.array(z.string()) })
      .superRefine((data, ctx) => {
        if (!data.tags.includes("obrigatoria")) {
          ctx.addIssue({ code: "custom", path: ["tags"], message: "faltou a tag obrigatória" });
        }
      });

    const { value } = normalizeModelOutput(refined, { tags: "outra" });
    expect(value).toEqual({ tags: ["outra"] });
    expect(refined.safeParse(value).success).toBe(false);
  });
});
