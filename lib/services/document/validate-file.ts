import { fileTypeFromBuffer } from "file-type";
import { createAppError } from "../../errors/app-error";
import { toolFailure, toolSuccess, type ToolResult } from "../../errors/tool-result";
import { MAX_UPLOAD_FILE_SIZE_BYTES } from "../../config/limits";
import { SUPPORTED_MIME_TYPES, type SupportedMimeType } from "../../schemas/document.schema";

export interface ValidatedFile {
  mimeType: SupportedMimeType;
}

const EXTENSION_BY_MIME: Record<SupportedMimeType, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
};

/**
 * PDF/DOCX/exe/etc. têm assinatura binária própria; TXT não tem magic bytes, então usamos uma
 * heurística de "parece texto imprimível" só quando a extensão declarada já é .txt (HU-02).
 */
function looksLikePlainText(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, 8000);
  if (sample.length === 0) return false;

  let suspiciousByteCount = 0;
  for (const byte of sample) {
    if (byte === 0) return false;
    const isPrintableAscii = byte >= 0x20 && byte <= 0x7e;
    const isCommonWhitespace = byte === 0x09 || byte === 0x0a || byte === 0x0d;
    const isUtf8ContinuationOrLead = byte >= 0x80;
    if (!isPrintableAscii && !isCommonWhitespace && !isUtf8ContinuationOrLead) {
      suspiciousByteCount += 1;
    }
  }
  return suspiciousByteCount / sample.length < 0.01;
}

export async function validateFile(
  buffer: Buffer,
  fileName: string,
): Promise<ToolResult<ValidatedFile>> {
  if (buffer.byteLength === 0) {
    return toolFailure(
      createAppError({
        code: "EMPTY_FILE",
        category: "VALIDATION",
        severity: "ERROR",
        description: "Uploaded file has zero bytes",
        userMessage: "O arquivo enviado está vazio.",
        isRetryable: false,
        operation: "validateFile",
      }),
    );
  }

  if (buffer.byteLength > MAX_UPLOAD_FILE_SIZE_BYTES) {
    return toolFailure(
      createAppError({
        code: "FILE_TOO_LARGE",
        category: "VALIDATION",
        severity: "ERROR",
        description: `File size ${buffer.byteLength} exceeds limit ${MAX_UPLOAD_FILE_SIZE_BYTES}`,
        userMessage: `O arquivo excede o tamanho máximo permitido (${Math.floor(
          MAX_UPLOAD_FILE_SIZE_BYTES / (1024 * 1024),
        )}MB).`,
        isRetryable: false,
        operation: "validateFile",
      }),
    );
  }

  const detected = await fileTypeFromBuffer(buffer);
  let resolvedMime: SupportedMimeType | undefined;

  if (detected && (SUPPORTED_MIME_TYPES as readonly string[]).includes(detected.mime)) {
    resolvedMime = detected.mime as SupportedMimeType;
  } else if (
    !detected &&
    fileName.toLowerCase().endsWith(".txt") &&
    looksLikePlainText(buffer)
  ) {
    resolvedMime = "text/plain";
  }

  if (!resolvedMime) {
    return toolFailure(
      createAppError({
        code: "UNSUPPORTED_FILE_TYPE",
        category: "VALIDATION",
        severity: "ERROR",
        description: `File signature did not match a supported type (detected: ${detected?.mime ?? "unknown"})`,
        userMessage: "Formato de arquivo não suportado. Envie um PDF, DOCX ou TXT.",
        isRetryable: false,
        operation: "validateFile",
        metadata: { detectedMime: detected?.mime, fileName },
      }),
    );
  }

  const expectedExtension = EXTENSION_BY_MIME[resolvedMime];
  if (!fileName.toLowerCase().endsWith(`.${expectedExtension}`)) {
    return toolFailure(
      createAppError({
        code: "FILE_SIGNATURE_MISMATCH",
        category: "VALIDATION",
        severity: "ERROR",
        description: `File signature indicates .${expectedExtension} but filename is "${fileName}"`,
        userMessage: "A extensão do arquivo não corresponde ao seu conteúdo real.",
        isRetryable: false,
        operation: "validateFile",
      }),
    );
  }

  return toolSuccess({ mimeType: resolvedMime });
}
