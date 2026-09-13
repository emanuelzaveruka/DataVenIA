import { describe, expect, it } from "vitest";
import {
  validateEvidenceHandoff,
  validateReportHandoff,
  validateSanitizationHandoff,
  validateScratchpadBatchHandoff,
} from "../handoff-validators";
import { buildReport } from "../../services/report/build-report";
import { analysis, caseAnalysis, evidence, scratchpad } from "../../services/report/__tests__/fixtures";
import { createAppError, type AppError } from "../../errors/app-error";
import type { FinalReport } from "../../schemas/report.schema";
import type { EvidenceVerificationResult } from "../../services/evidence/verify-evidence";
import type { ScratchpadBatchResult } from "../../services/scratchpad/generate-scratchpads";

function expectViolation(violation: AppError | undefined, matching: RegExp): AppError {
  expect(violation).toBeDefined();
  expect(violation!.code).toBe("HANDOFF_CONTRACT_VIOLATED");
  // Uma violação de contrato é bug de integração: repetir a chamada daria o mesmo resultado.
  expect(violation!.isRetryable).toBe(false);
  expect(violation!.description).toMatch(matching);
  return violation!;
}

describe("validateSanitizationHandoff (HU-05/HU-06)", () => {
  const sanitized = {
    documentId: "doc-1",
    sanitizedText: "O autor [PARTE_1], CPF [CPF/CNPJ], reside em [ENDEREÇO].",
    redactions: [
      { type: "PARTY_NAME" as const, marker: "[PARTE_1]", count: 1 },
      { type: "CPF_CNPJ" as const, marker: "[CPF/CNPJ]", count: 1 },
      { type: "ADDRESS" as const, marker: "[ENDEREÇO]", count: 1 },
    ],
  };

  const validate = validateSanitizationHandoff({ documentId: "doc-1" });

  it("accepts a payload whose markers are all present in the sanitized text", () => {
    expect(validate(sanitized)).toBeUndefined();
  });

  it("rejects a payload that changed the documentId of the parsed document", () => {
    expectViolation(validate({ ...sanitized, documentId: "doc-outro" }), /documentId/);
  });

  it("rejects a type counted as masked whose marker never reached the text", () => {
    expectViolation(
      validate({
        ...sanitized,
        sanitizedText: "O autor [PARTE_1], CPF [CPF/CNPJ], reside na Rua das Acácias, 120.",
      }),
      /\[ENDEREÇO\].*não aparece/,
    );
  });

  it("tolerates a count above the visible markers, which overlapping detectors produce", () => {
    // Endereço dentro de "residente e domiciliado em ...": o segundo detector substitui o trecho
    // inteiro e absorve o marcador que o primeiro inseriu. Dois mascaramentos, um marcador — e
    // nenhum dado pessoal exposto, que é o que esta checagem existe para garantir.
    expect(
      validate({
        ...sanitized,
        redactions: [{ type: "ADDRESS" as const, marker: "[ENDEREÇO]", count: 2 }],
      }),
    ).toBeUndefined();
  });

});

describe("validateScratchpadBatchHandoff (HU-17/HU-19)", () => {
  const scratchpads = [scratchpad("SP-1"), scratchpad("SP-2")];
  const selectedCandidateIds = scratchpads.map((item) => item.source.sourceId);
  const validate = validateScratchpadBatchHandoff({ selectedCandidateIds });

  const batchFailureError = createAppError({
    code: "INVALID_SCRATCHPAD_SCHEMA",
    category: "STRUCTURED_OUTPUT",
    severity: "ERROR",
    description: "holdings ausente",
    isRetryable: true,
  });

  const batch: ScratchpadBatchResult = {
    status: "SUCCESS",
    requested: 2,
    processed: 2,
    failed: 0,
    scratchpads,
    failures: [],
  };

  it("accepts a batch whose counts and sources match the selection", () => {
    expect(validate(batch)).toBeUndefined();
  });

  it("rejects counts that do not describe the arrays they summarize", () => {
    // O gate de HU-19 conta por este número: inflado, ele deixaria passar uma amostra que não existe.
    expectViolation(validate({ ...batch, processed: 5 }), /processed=5/);
  });

  it("rejects a status that contradicts the failures in the batch", () => {
    expectViolation(
      validate({
        ...batch,
        processed: 1,
        failed: 1,
        scratchpads: [scratchpads[0]!],
        failures: [{ candidateId: selectedCandidateIds[1]!, error: batchFailureError }],
      }),
      /status "SUCCESS"/,
    );
  });

  it("rejects a scratchpad produced over a decision that was never selected", () => {
    expectViolation(
      validate({
        ...batch,
        scratchpads: [
          scratchpads[0]!,
          scratchpad("SP-9", { source: { ...scratchpads[1]!.source, sourceId: "fixture-intrusa" } }),
        ],
      }),
      /fora da seleção/,
    );
  });

  it("rejects a repeated scratchpadId, which would make cross-file references ambiguous", () => {
    expectViolation(
      validate({ ...batch, scratchpads: [scratchpads[0]!, scratchpad("SP-1")] }),
      /repetido/,
    );
  });
});

describe("validateEvidenceHandoff (HU-24/HU-25)", () => {
  const scratchpads = [scratchpad("SP-1"), scratchpad("SP-7")];
  const validate = validateEvidenceHandoff({ scratchpads });

  const result: EvidenceVerificationResult = {
    evidences: [evidence("EV-1", "SP-1"), evidence("EV-7", "SP-7", { verified: false, matchKind: "NOT_FOUND", similarity: 0.2 })],
    verifiedCount: 1,
    rejectedCount: 1,
    staleScratchpadIds: [],
    failures: [],
  };

  it("accepts a verification consistent with the scratchpads it received", () => {
    expect(validate(result)).toBeUndefined();
  });

  it("rejects evidence attached to a scratchpad that does not exist in this run", () => {
    expectViolation(
      validate({ ...result, evidences: [evidence("EV-X", "SP-inexistente")], verifiedCount: 1, rejectedCount: 0 }),
      /scratchpadId inexistente/,
    );
  });

  it("rejects counts that disagree with the evidence array shown on screen", () => {
    expectViolation(validate({ ...result, verifiedCount: 2 }), /verifiedCount=2/);
  });

  it("rejects verified: true without a matchKind that located the quote", () => {
    expectViolation(
      validate({
        ...result,
        evidences: [evidence("EV-1", "SP-1", { matchKind: "NOT_FOUND" })],
        verifiedCount: 1,
        rejectedCount: 0,
      }),
      /verified incompatível com matchKind/,
    );
  });

  it("rejects a quote verified against a source that changed since collection", () => {
    expectViolation(
      validate({ ...result, staleScratchpadIds: ["SP-1"] }),
      /fonte que mudou/,
    );
  });
});

describe("validateReportHandoff (HU-25/HU-27)", () => {
  const scratchpads = [scratchpad("SP-1"), scratchpad("SP-7", { distinguishingFacts: ["Contrato coletivo."] })];
  const evidences = [evidence("EV-1", "SP-1"), evidence("EV-7", "SP-7")];

  function report(): FinalReport {
    const result = buildReport({
      caseAnalysis: caseAnalysis(),
      analyses: [analysis()],
      evidences,
      scratchpads,
    });
    if (result.isError) throw new Error(result.error.description);
    return result.data;
  }

  const validate = validateReportHandoff({ evidences, scratchpads });

  it("accepts a report built from the verified evidence of this run", () => {
    expect(validate(report())).toBeUndefined();
  });

  it("rejects a report citing evidence that verification did not approve", () => {
    // Checado contra o que a verificação aprovou, não contra a lista que `buildReport` recebeu:
    // é a diferença entre coerente com a entrada e coerente com a fonte.
    const unverified = validateReportHandoff({
      evidences: [evidence("EV-1", "SP-1"), evidence("EV-7", "SP-7", { verified: false, matchKind: "NOT_FOUND" })],
      scratchpads,
    });

    expectViolation(unverified(report()), /evidência não verificada/);
  });

  it("rejects a report citing a scratchpad that is not part of this run", () => {
    // Mesma quantidade de decisões, outro id: o motivo da reprovação é a referência, não a contagem.
    expectViolation(
      validateReportHandoff({ evidences, scratchpads: [scratchpads[0]!, scratchpad("SP-99")] })(report()),
      /scratchpadId inexistente nesta execução: SP-7/,
    );
  });

  it("rejects sample counts that do not describe the artifacts they summarize", () => {
    const inflated = { ...report(), sample: { ...report().sample, verifiedEvidence: 99 } };
    expectViolation(validate(inflated), /sample.verifiedEvidence=99/);
  });
});
