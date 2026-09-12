import { NextResponse } from "next/server";
import { preToolUse } from "../../../lib/hooks/pre-tool-use";
import { postToolUse } from "../../../lib/hooks/post-tool-use";
import { validateFile } from "../../../lib/services/document/validate-file";
import { parseDocument } from "../../../lib/services/document/parse-document";
import { sanitizeDocument } from "../../../lib/services/document/sanitize";
import { saveDocument } from "../../../lib/store/in-memory-document-store";
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

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: { code: "MISSING_FILE", userMessage: "Envie um arquivo no campo \"file\"." } },
      { status: 400 },
    );
  }

  const startedAt = Date.now();
  recorder.record("RECEIVED", "Arquivo recebido", "COMPLETED", startedAt);

  const buffer = Buffer.from(await file.arrayBuffer());

  const validationStartedAt = Date.now();
  preToolUse({ stage: STAGE, toolName: "validateFile" });
  const validation = postToolUse(await validateFile(buffer, file.name), {
    stage: STAGE,
    toolName: "validateFile",
  });
  if (validation.isError) {
    recorder.record("VALIDATING", "Validando arquivo", "FAILED", validationStartedAt);
    return errorResponse(validation.error);
  }
  recorder.record("VALIDATING", "Validando arquivo", "COMPLETED", validationStartedAt);

  const parsingStartedAt = Date.now();
  preToolUse({ stage: STAGE, toolName: "parseDocument" });
  const parsed = postToolUse(
    await parseDocument(buffer, file.name, validation.data.mimeType),
    { stage: STAGE, toolName: "parseDocument" },
  );
  if (parsed.isError) {
    recorder.record("PARSING", "Extraindo texto", "FAILED", parsingStartedAt);
    return errorResponse(parsed.error);
  }
  recorder.record("PARSING", "Extraindo texto", "COMPLETED", parsingStartedAt);

  const sanitizingStartedAt = Date.now();
  preToolUse({ stage: STAGE, toolName: "sanitizeDocument" });
  const sanitized = postToolUse(sanitizeDocument(parsed.data.documentId, parsed.data.text), {
    stage: STAGE,
    toolName: "sanitizeDocument",
  });
  if (sanitized.isError) {
    recorder.record("SANITIZING", "Sanitizando dados pessoais", "FAILED", sanitizingStartedAt);
    return errorResponse(sanitized.error);
  }
  recorder.record("SANITIZING", "Sanitizando dados pessoais", "COMPLETED", sanitizingStartedAt);

  saveDocument(parsed.data.documentId, {
    parsed: parsed.data,
    sanitizedText: sanitized.data.sanitizedText,
    redactions: sanitized.data.redactions,
  });

  return NextResponse.json({
    documentId: parsed.data.documentId,
    fileName: parsed.data.fileName,
    mimeType: parsed.data.mimeType,
    metadata: parsed.data.metadata,
    sanitizedTextPreview: sanitized.data.sanitizedText.slice(0, 2000),
    redactions: sanitized.data.redactions,
    stages: recorder.events,
  });
}
