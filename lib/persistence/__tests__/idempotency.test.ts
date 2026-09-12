import { describe, expect, it } from "vitest";
import { buildIdempotencyKey } from "../idempotency";
import type { PipelineVersions } from "../../config/versions";

const versions: PipelineVersions = {
  pipelineVersion: "1.0.0",
  promptVersion: "1.0.0",
  modelVersion: "claude-sonnet-4-5-20250929",
};

describe("buildIdempotencyKey (HU-33/§11.6)", () => {
  it("is stable for the same decision and the same versions", () => {
    expect(buildIdempotencyKey("fixture-001", versions)).toBe(
      buildIdempotencyKey("fixture-001", versions),
    );
  });

  it("is a sha256 digest", () => {
    expect(buildIdempotencyKey("fixture-001", versions)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when the prompt version changes — no silent reuse across prompts", () => {
    const other = buildIdempotencyKey("fixture-001", { ...versions, promptVersion: "1.1.0" });
    expect(other).not.toBe(buildIdempotencyKey("fixture-001", versions));
  });

  it("changes when the model version changes", () => {
    const other = buildIdempotencyKey("fixture-001", { ...versions, modelVersion: "gpt-4.1" });
    expect(other).not.toBe(buildIdempotencyKey("fixture-001", versions));
  });

  it("changes when the pipeline version changes", () => {
    const other = buildIdempotencyKey("fixture-001", { ...versions, pipelineVersion: "2.0.0" });
    expect(other).not.toBe(buildIdempotencyKey("fixture-001", versions));
  });

  it("changes with the decision", () => {
    expect(buildIdempotencyKey("fixture-002", versions)).not.toBe(
      buildIdempotencyKey("fixture-001", versions),
    );
  });

  it("cannot be collided by shifting characters between fields", () => {
    // Sem separador, "ab" + "c" e "a" + "bc" gerariam a mesma string de entrada.
    const left = buildIdempotencyKey("ab", { ...versions, promptVersion: "c" });
    const right = buildIdempotencyKey("a", { ...versions, promptVersion: "bc" });
    expect(left).not.toBe(right);
  });
});
