import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { preToolUse } from "../../../lib/hooks/pre-tool-use";
import { postToolUse } from "../../../lib/hooks/post-tool-use";
import { validateFile } from "../../../lib/services/document/validate-file";
import { parseDocument } from "../../../lib/services/document/parse-document";
import { sanitizeDocument } from "../../../lib/services/document/sanitize";
import { getRepository } from "../../../lib/persistence/get-repository";
import { createExecutionRecorder } from "../../../lib/observability/execution-recorder";
import { buildPipelineProgress } from "../../../lib/observability/pipeline-progress";
import { PIPELINE_VERSION } from "../../../lib/config/versions";
import { createStageRecorder } from "../../../lib/workflow/pipeline-stage-event";
import type { AppError } from "../../../lib/errors/app-error";

export const runtime = "nodejs";

const STAGE = "DOCUMENT_ANALYSIS" as const;

function errorResponse(error: AppError) {
  const status = error.category === "VALIDATION" || error.category === "PARSING" ? 422 : 500;
  return NextResponse.json({ error }, { status });
}

export async function POST(request: Request) {
  const recorder = createStageRecorder();
  const repository = getRepository();

  // Uma execução (§11.8) e um traceId por requisição: é o que amarra documento, logs de tool e
  // erros na mesma linha do tempo auditável (HU-34/HU-35).
  const runId = randomUUID();
  const traceId = randomUUID();
  const startedAt = new Date().toISOString();

  const execution = createExecutionRecorder({
    traceId,
    workflowId: runId,
    sink: (log) => void repository.saveToolExecution(log),
  });

  async function failWith(error: AppError) {
    await repository.saveError({
      runId,
      traceId,
      code: error.code,
      category: error.category,
      severity: error.severity,
      description: error.description,
      userMessage: error.userMessage,
      isRetryable: error.isRetryable,
      operation: error.operation,
      metadata: error.metadata,
      occurredAt: new Date().toISOString(),
    });
    await repository.updateRun(runId, { status: "FAILED", finishedAt: new Date().toISOString() });
    return errorResponse(error);
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: { code: "MISSING_FILE", userMessage: "Envie um arquivo no campo \"file\"." } },
      { status: 400 },
    );
  }

  await repository.createRun({
    runId,
    traceId,
    stage: STAGE,
    status: "UPLOADED",
    pipelineVersion: PIPELINE_VERSION,
    startedAt,
  });

  const receivedAt = Date.now();
  recorder.record("RECEIVED", "Arquivo recebido", "COMPLETED", receivedAt);

  const buffer = Buffer.from(await file.arrayBuffer());

  const validationStartedAt = Date.now();
  preToolUse({ stage: STAGE, toolName: "validateFile" });
  const validation = postToolUse(await validateFile(buffer, file.name), {
    stage: STAGE,
    toolName: "validateFile",
    recorder: execution,
    startedAtMs: validationStartedAt,
  });
  if (validation.isError) {
    recorder.record("VALIDATING", "Validando arquivo", "FAILED", validationStartedAt);
    return failWith(validation.error);
  }
  recorder.record("VALIDATING", "Validando arquivo", "COMPLETED", validationStartedAt);

  const parsingStartedAt = Date.now();
  preToolUse({ stage: STAGE, toolName: "parseDocument" });
  const parsed = postToolUse(
    await parseDocument(buffer, file.name, validation.data.mimeType),
    { stage: STAGE, toolName: "parseDocument", recorder: execution, startedAtMs: parsingStartedAt },
  );
  if (parsed.isError) {
    recorder.record("PARSING", "Extraindo texto", "FAILED", parsingStartedAt);
    return failWith(parsed.error);
  }
  recorder.record("PARSING", "Extraindo texto", "COMPLETED", parsingStartedAt);

  const sanitizingStartedAt = Date.now();
  preToolUse({ stage: STAGE, toolName: "sanitizeDocument" });
  const sanitized = postToolUse(sanitizeDocument(parsed.data.documentId, parsed.data.text), {
    stage: STAGE,
    toolName: "sanitizeDocument",
    recorder: execution,
    startedAtMs: sanitizingStartedAt,
  });
  if (sanitized.isError) {
    recorder.record("SANITIZING", "Sanitizando dados pessoais", "FAILED", sanitizingStartedAt);
    return failWith(sanitized.error);
  }
  recorder.record("SANITIZING", "Sanitizando dados pessoais", "COMPLETED", sanitizingStartedAt);

  // Só o texto sanitizado é persistido (HU-05/HU-34): `parsed.data.text` (bruto) morre aqui, no
  // escopo da requisição, e não existe coluna capaz de recebê-lo.
  await repository.saveDocument({
    documentId: parsed.data.documentId,
    runId,
    fileName: parsed.data.fileName,
    mimeType: parsed.data.mimeType,
    contentHash: parsed.data.metadata.hash,
    pageCount: parsed.data.metadata.pageCount,
    sanitizedText: sanitized.data.sanitizedText,
    redactions: sanitized.data.redactions,
    createdAt: new Date().toISOString(),
  });

  await repository.updateRun(runId, { status: "DOCUMENT_PARSED" });

  return NextResponse.json({
    runId,
    traceId,
    documentId: parsed.data.documentId,
    fileName: parsed.data.fileName,
    mimeType: parsed.data.mimeType,
    metadata: parsed.data.metadata,
    sanitizedTextPreview: sanitized.data.sanitizedText.slice(0, 2000),
    redactions: sanitized.data.redactions,
    stages: recorder.events,
    progress: buildPipelineProgress({ documentParsed: true }),
  });
}
