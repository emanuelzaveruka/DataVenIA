import { describe, expect, it, vi } from "vitest";
import { verifyEvidence } from "../verify-evidence";
import { crossFileAnalysis, DECISION_TEXT_1, DECISION_TEXT_2, scratchpadFor } from "./fixtures";
import type { JurisprudenceProvider } from "../../../providers/jurisprudence-provider";
import type { RawDecision } from "../../../schemas/search.schema";
import { toolFailure, toolSuccess } from "../../../errors/tool-result";
import { createAppError } from "../../../errors/app-error";

function rawDecision(id: string, fullText: string | undefined): RawDecision {
  return { id, court: "TJPR", fullText, sourceUrl: `https://tjpr.jus.br/${id}` };
}

function providerWith(texts: Record<string, string | undefined>, missing: string[] = []): JurisprudenceProvider {
  return {
    name: "fake",
    search: vi.fn(),
    fetchDecision: vi.fn(async (decisionId: string) => {
      if (missing.includes(decisionId)) {
        return toolFailure(
          createAppError({
            code: "FIXTURE_DECISION_NOT_FOUND",
            category: "NOT_FOUND",
            severity: "ERROR",
            description: `Decision ${decisionId} not found`,
            isRetryable: false,
            operation: "fetchDecision",
          }),
        );
      }
      return toolSuccess(rawDecision(decisionId, texts[decisionId]));
    }),
  };
}

const supporting = scratchpadFor("SP-1", "fixture-001", DECISION_TEXT_1, [
  { id: "EV-1", quote: "A negativa de cobertura do tratamento prescrito", context: "Voto.", purpose: "Sustenta a abusividade." },
  { id: "EV-3", quote: "A operadora foi condenada a pagar R$ 50.000,00 de indenização", context: "Voto.", purpose: "Sustenta o valor pedido." },
]);

const opposing = scratchpadFor("SP-2", "fixture-002", DECISION_TEXT_2, [
  { id: "EV-2", quote: "O mero inadimplemento contratual não gera dano moral", context: "Voto.", purpose: "Afasta o dano moral." },
]);

const texts = { "fixture-001": DECISION_TEXT_1, "fixture-002": DECISION_TEXT_2 };

describe("verifyEvidence", () => {
  it("reopens the original decisions and confirms the quotes that really exist (HU-24)", async () => {
    const provider = providerWith(texts);

    const result = await verifyEvidence([crossFileAnalysis()], [supporting, opposing], provider);

    expect(result.isError).toBe(false);
    if (result.isError) return;
    expect(provider.fetchDecision).toHaveBeenCalledTimes(2);

    const byId = new Map(result.data.evidences.map((evidence) => [evidence.evidenceId, evidence]));
    expect(byId.get("EV-1")?.verified).toBe(true);
    expect(byId.get("EV-2")?.verified).toBe(true);
    expect(result.data.verifiedCount).toBe(2);
  });

  it("marks as unverified a quote that is not in the original text, blocking it from the report (HU-24/HU-25)", async () => {
    const result = await verifyEvidence([crossFileAnalysis()], [supporting, opposing], providerWith(texts));

    expect(result.isError).toBe(false);
    if (result.isError) return;
    const fabricated = result.data.evidences.find((evidence) => evidence.evidenceId === "EV-3");
    expect(fabricated?.verified).toBe(false);
    expect(fabricated?.matchKind).toBe("NOT_FOUND");
    expect(result.data.rejectedCount).toBe(1);
  });

  it("carries the full provenance of each evidence (§3.9/HU-27)", async () => {
    const result = await verifyEvidence([crossFileAnalysis()], [supporting, opposing], providerWith(texts));

    expect(result.isError).toBe(false);
    if (result.isError) return;
    const evidence = result.data.evidences.find((item) => item.evidenceId === "EV-1")!;
    expect(evidence.scratchpadId).toBe("SP-1");
    expect(evidence.proposition).toBe("Sustenta a abusividade.");
    expect(evidence.source.url).toBe("https://tjpr.jus.br/fixture-001");
    expect(evidence.source.chamber).toBe("5ª Câmara Cível");
    expect(evidence.source.sourceHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses to trust a stale scratchpad when the source changed since collection (HU-24/§11.8)", async () => {
    const changed = { ...texts, "fixture-001": `${DECISION_TEXT_1} Retificado por embargos de declaração.` };

    const result = await verifyEvidence([crossFileAnalysis()], [supporting, opposing], providerWith(changed));

    expect(result.isError).toBe(false);
    if (result.isError) return;
    expect(result.data.staleScratchpadIds).toEqual(["SP-1"]);
    const evidence = result.data.evidences.find((item) => item.evidenceId === "EV-1")!;
    expect(evidence.verified).toBe(false);
    expect(evidence.matchKind).toBe("SOURCE_CHANGED");
  });

  it("isolates a decision that cannot be reopened, still verifying the others (HU-19/§11.5)", async () => {
    const provider = providerWith(texts, ["fixture-001"]);

    const result = await verifyEvidence([crossFileAnalysis()], [supporting, opposing], provider);

    expect(result.isError).toBe(false);
    if (result.isError) return;
    expect(result.data.failures).toHaveLength(1);
    expect(result.data.failures[0]!.scratchpadId).toBe("SP-1");
    expect(result.data.evidences.map((evidence) => evidence.evidenceId)).toEqual(["EV-2"]);
  });

  it("reports an empty reopened decision as a failure instead of silently verifying nothing", async () => {
    const provider = providerWith({ ...texts, "fixture-002": undefined });

    const result = await verifyEvidence([crossFileAnalysis()], [supporting, opposing], provider);

    expect(result.isError).toBe(false);
    if (result.isError) return;
    expect(result.data.failures[0]!.error.code).toBe("EMPTY_SOURCE_FOR_VERIFICATION");
  });
});
