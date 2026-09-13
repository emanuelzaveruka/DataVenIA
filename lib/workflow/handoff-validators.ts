import { createAppError, type AppError } from "../errors/app-error";
import type { ToolResultValidator } from "../hooks/post-tool-use";
import type { RedactionSummary } from "../schemas/sanitization.schema";
import type { DecisionScratchpad } from "../schemas/scratchpad.schema";
import type { VerifiedEvidence } from "../schemas/evidence.schema";
import type { FinalReport } from "../schemas/report.schema";
import type { ScratchpadBatchResult } from "../services/scratchpad/generate-scratchpads";
import type { EvidenceVerificationResult } from "../services/evidence/verify-evidence";

/**
 * Segunda camada de §11.2 aplicada ao pipeline: as checagens de contrato **entre** etapas, que o
 * `postToolUse` executa sobre o payload antes de o orquestrador avançar.
 *
 * O critério para uma regra morar aqui, e não no schema do serviço, é um só: ela precisa comparar
 * o resultado de uma etapa com um artefato que a etapa anterior produziu — algo que o serviço, que
 * só enxerga a própria entrada e saída, não tem como verificar. Tudo que um `z.object` ou um
 * `superRefine` já garante fica onde está; repetir aqui criaria duas fontes da mesma regra, e a
 * segunda envelheceria calada.
 *
 * Nenhum validator corrige nada — todos devolvem `AppError` ou `undefined`. Uma inconsistência
 * aqui é bug de integração, não falha de negócio: por isso `INTERNAL` e `isRetryable: false`.
 * Repetir a chamada produziria o mesmo resultado inconsistente.
 */

const USER_MESSAGE =
  "Uma etapa da análise devolveu um resultado inconsistente com a etapa anterior. " +
  "O processamento foi interrompido em vez de seguir sobre dado não conferido.";

function handoffViolation(params: {
  operation: string;
  severity: AppError["severity"];
  problems: string[];
  metadata?: Record<string, unknown>;
}): AppError | undefined {
  if (params.problems.length === 0) return undefined;

  return createAppError({
    code: "HANDOFF_CONTRACT_VIOLATED",
    category: "INTERNAL",
    severity: params.severity,
    description:
      `${params.operation} devolveu um payload inconsistente com a etapa anterior: ` +
      params.problems.join("; "),
    userMessage: USER_MESSAGE,
    isRetryable: false,
    operation: params.operation,
    metadata: { ...params.metadata, problems: params.problems },
  });
}

function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  return haystack.split(needle).length - 1;
}

function missingFrom(ids: readonly string[], allowed: ReadonlySet<string>): string[] {
  return Array.from(new Set(ids.filter((id) => !allowed.has(id))));
}

export interface SanitizationHandoff {
  documentId: string;
  sanitizedText: string;
  redactions: RedactionSummary[];
}

/**
 * HU-05/HU-06 na fronteira em que o texto deixa de ser bruto. Duas coisas que a sanitização não
 * consegue afirmar sobre si mesma:
 *
 * 1. que o documento entregue é o mesmo que foi extraído — trocar o `documentId` aqui faria o
 *    texto sanitizado ser persistido sob outro documento, e §14 deixaria de fechar;
 * 2. que cada marcador **contado** no resumo foi de fato **substituído** no texto. As contagens de
 *    `redactions` são incrementadas durante a varredura; um tipo contado cujo marcador não aparece
 *    no texto de saída significa que o resumo declara ter mascarado algo que continua legível.
 *    Por isso a comparação é contra o texto final, e não contra o contador.
 *
 * A comparação é de presença, não de igualdade de contagem: dois detectores podem se sobrepor e o
 * segundo absorver o marcador que o primeiro inseriu (é o que acontece com um endereço dentro de
 * "residente e domiciliado em ..."), então `count` pode legitimamente superar o número de
 * marcadores visíveis. O que nunca pode acontecer é um tipo contado sem nenhum marcador no texto.
 */
export function validateSanitizationHandoff(expected: {
  documentId: string;
}): ToolResultValidator<SanitizationHandoff> {
  return (data) => {
    const problems: string[] = [];

    if (data.documentId !== expected.documentId) {
      problems.push(
        `documentId "${data.documentId}" não é o do documento extraído ("${expected.documentId}")`,
      );
    }

    // Por marcador, e não por tipo: CPF e CNPJ têm detectores separados e o mesmo `[CPF/CNPJ]`.
    const claimedByMarker = new Map<string, number>();
    for (const redaction of data.redactions) {
      claimedByMarker.set(
        redaction.marker,
        (claimedByMarker.get(redaction.marker) ?? 0) + redaction.count,
      );
    }
    for (const [marker, claimed] of claimedByMarker) {
      if (claimed > 0 && countOccurrences(data.sanitizedText, marker) === 0) {
        problems.push(
          `o resumo declara ${claimed} ocorrência(s) mascarada(s) com "${marker}", ` +
          "mas o marcador não aparece no texto sanitizado",
        );
      }
    }

    return handoffViolation({
      operation: "sanitizeDocument",
      // O único caminho do pipeline que pode vazar dado pessoal: falha aqui não é "etapa que não
      // deu certo", é o motivo pelo qual a sanitização é bloqueante em HU-05.
      severity: "FATAL",
      problems,
      metadata: { documentId: expected.documentId },
    });
  };
}

/**
 * HU-17/HU-19. As contagens do lote não vêm de schema nenhum: são somadas em código a partir dos
 * resultados do pool, e são exatamente o que alimenta o gate de "scratchpads válidos suficientes"
 * e o progresso de §11.9. Se elas divergirem dos arrays, o gate passa a contar decisão que não
 * existe — e ninguém percebe, porque o número continua plausível.
 *
 * O segundo bloco é referencial: todo Scratchpad tem de ser de uma decisão **selecionada** na Fase
 * 4. `generateScratchpad` monta `source.sourceId` a partir do que o provider devolveu, não do id
 * que pediu; um provider que responde outra decisão produziria análise de um acórdão que nunca
 * entrou no funil.
 */
export function validateScratchpadBatchHandoff(expected: {
  selectedCandidateIds: readonly string[];
}): ToolResultValidator<ScratchpadBatchResult> {
  const selected = new Set(expected.selectedCandidateIds);

  return (data) => {
    const problems: string[] = [];

    if (data.requested !== selected.size) {
      problems.push(
        `requested=${data.requested} não corresponde às ${selected.size} decisões selecionadas`,
      );
    }
    if (data.processed !== data.scratchpads.length) {
      problems.push(
        `processed=${data.processed} não corresponde aos ${data.scratchpads.length} scratchpads devolvidos`,
      );
    }
    if (data.failed !== data.failures.length) {
      problems.push(
        `failed=${data.failed} não corresponde às ${data.failures.length} falhas devolvidas`,
      );
    }
    if (data.processed + data.failed !== data.requested) {
      problems.push(
        `processed (${data.processed}) + failed (${data.failed}) não fecha com requested (${data.requested})`,
      );
    }
    if ((data.status === "SUCCESS") !== (data.failures.length === 0)) {
      problems.push(
        `status "${data.status}" não descreve um lote com ${data.failures.length} falha(s)`,
      );
    }

    const ids = data.scratchpads.map((scratchpad) => scratchpad.scratchpadId);
    if (new Set(ids).size !== ids.length) {
      problems.push("há scratchpadId repetido no lote — as referências do cross-file ficariam ambíguas");
    }

    const foreignSources = missingFrom(
      data.scratchpads.map((scratchpad) => scratchpad.source.sourceId),
      selected,
    );
    if (foreignSources.length > 0) {
      problems.push(
        `scratchpad(s) gerados sobre decisões fora da seleção da busca: ${foreignSources.join(", ")}`,
      );
    }

    const foreignFailures = missingFrom(
      data.failures.map((failure) => failure.candidateId),
      selected,
    );
    if (foreignFailures.length > 0) {
      problems.push(`falha(s) atribuídas a decisões fora da seleção: ${foreignFailures.join(", ")}`);
    }

    return handoffViolation({
      operation: "generateScratchpads",
      severity: "ERROR",
      problems,
      metadata: { selectedCount: selected.size },
    });
  };
}

/**
 * HU-24/HU-25. VERIFY é a etapa em que o pipeline deixa de confiar no modelo, então o que ela
 * devolve é justamente o que ninguém mais confere depois — `verifiedCount` vira número de tela e
 * `verified: true` vira permissão para citar.
 *
 * A regra sobre `staleScratchpadIds` é a que o schema não alcança: fonte alterada desde a coleta
 * (§11.8) não pode produzir citação verificada, porque a comparação foi feita contra um texto que
 * não é mais o da decisão.
 */
export function validateEvidenceHandoff(expected: {
  scratchpads: readonly DecisionScratchpad[];
}): ToolResultValidator<EvidenceVerificationResult> {
  const known = new Set(expected.scratchpads.map((scratchpad) => scratchpad.scratchpadId));

  return (data) => {
    const problems: string[] = [];

    const unknownIds = missingFrom(
      [
        ...data.evidences.map((evidence) => evidence.scratchpadId),
        ...data.staleScratchpadIds,
        ...data.failures.map((failure) => failure.scratchpadId),
      ],
      known,
    );
    if (unknownIds.length > 0) {
      problems.push(`referência a scratchpadId inexistente nesta execução: ${unknownIds.join(", ")}`);
    }

    const verified = data.evidences.filter((evidence) => evidence.verified).length;
    if (data.verifiedCount !== verified) {
      problems.push(`verifiedCount=${data.verifiedCount} não corresponde às ${verified} evidências verificadas`);
    }
    if (data.rejectedCount !== data.evidences.length - verified) {
      problems.push(
        `rejectedCount=${data.rejectedCount} não corresponde às ` +
        `${data.evidences.length - verified} evidências reprovadas`,
      );
    }

    const MATCHED: readonly VerifiedEvidence["matchKind"][] = ["EXACT", "ELIDED", "NEAR_LITERAL"];
    const inconsistent = data.evidences.filter(
      (evidence) => evidence.verified !== MATCHED.includes(evidence.matchKind),
    );
    if (inconsistent.length > 0) {
      problems.push(
        `${inconsistent.length} evidência(s) com verified incompatível com matchKind ` +
        `(ex.: ${inconsistent[0]!.evidenceId} · ${inconsistent[0]!.matchKind})`,
      );
    }

    const stale = new Set(data.staleScratchpadIds);
    const verifiedFromStale = data.evidences.filter(
      (evidence) => evidence.verified && stale.has(evidence.scratchpadId),
    );
    if (verifiedFromStale.length > 0) {
      problems.push(
        `${verifiedFromStale.length} citação(ões) marcadas como verificadas sobre fonte que mudou ` +
        "desde a coleta",
      );
    }

    return handoffViolation({
      operation: "verifyEvidence",
      severity: "ERROR",
      problems,
      metadata: { scratchpadCount: known.size },
    });
  };
}

/**
 * HU-25/HU-27 na última porta antes da tela. `buildReport` já reaplica a política de evidência de
 * forma idempotente, mas ele a reaplica sobre a lista que **recebeu**; esta checagem é feita de
 * fora, contra as evidências que a verificação realmente aprovou nesta execução. É a diferença
 * entre "o relatório é coerente com sua entrada" e "o relatório é coerente com a fonte".
 *
 * As contagens de `sample` entram junto porque são a frase que o usuário lê como resumo da amostra
 * (§3.10) — um número ali que não bata com os artefatos é uma afirmação falsa sobre o que foi
 * analisado, ainda que todo o resto do relatório esteja certo.
 */
export function validateReportHandoff(expected: {
  evidences: readonly VerifiedEvidence[];
  scratchpads: readonly DecisionScratchpad[];
}): ToolResultValidator<FinalReport> {
  const verifiedIds = new Set(
    expected.evidences.filter((evidence) => evidence.verified).map((evidence) => evidence.evidenceId),
  );
  const scratchpadIds = new Set(expected.scratchpads.map((scratchpad) => scratchpad.scratchpadId));

  return (data) => {
    const problems: string[] = [];

    const citedEvidenceIds: string[] = [];
    const citedScratchpadIds: string[] = [];

    for (const issue of data.issues) {
      for (const item of [...issue.favorablePoints, ...issue.contraryPoints]) {
        citedEvidenceIds.push(item.evidenceId);
        citedScratchpadIds.push(item.scratchpadId);
      }
      for (const claim of [...issue.risks, ...issue.suggestedArguments]) {
        citedEvidenceIds.push(...claim.evidenceIds);
      }
      citedScratchpadIds.push(...issue.distinguishing.map((item) => item.scratchpadId));
    }

    const unverified = missingFrom(citedEvidenceIds, verifiedIds);
    if (unverified.length > 0) {
      problems.push(
        `o relatório cita evidência não verificada nesta execução (HU-25): ${unverified.join(", ")}`,
      );
    }

    const unknownScratchpads = missingFrom(citedScratchpadIds, scratchpadIds);
    if (unknownScratchpads.length > 0) {
      problems.push(
        `o relatório cita scratchpadId inexistente nesta execução: ${unknownScratchpads.join(", ")}`,
      );
    }

    if (data.sample.analyzedDecisions !== expected.scratchpads.length) {
      problems.push(
        `sample.analyzedDecisions=${data.sample.analyzedDecisions} não corresponde às ` +
        `${expected.scratchpads.length} decisões analisadas`,
      );
    }
    if (data.sample.verifiedEvidence !== verifiedIds.size) {
      problems.push(
        `sample.verifiedEvidence=${data.sample.verifiedEvidence} não corresponde às ` +
        `${verifiedIds.size} citações verificadas`,
      );
    }
    if (data.sample.omittedItems !== data.omissions.length) {
      problems.push(
        `sample.omittedItems=${data.sample.omittedItems} não corresponde aos ` +
        `${data.omissions.length} itens registrados em omissions`,
      );
    }

    return handoffViolation({
      operation: "buildReport",
      severity: "ERROR",
      problems,
      metadata: { verifiedEvidenceCount: verifiedIds.size },
    });
  };
}
