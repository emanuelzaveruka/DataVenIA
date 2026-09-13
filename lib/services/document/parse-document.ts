import { randomUUID } from "node:crypto";
import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";
import { createAppError } from "../../errors/app-error";
import { toolFailure, toolSuccess, type ToolResult } from "../../errors/tool-result";
import { hashBuffer } from "./hash";
import type { ParsedDocument, SupportedMimeType } from "../../schemas/document.schema";

async function extractPdfText(buffer: Buffer): Promise<{ text: string; pageCount: number }> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  return { text, pageCount: totalPages };
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

export async function parseDocument(
  buffer: Buffer,
  fileName: string,
  mimeType: SupportedMimeType,
): Promise<ToolResult<ParsedDocument>> {
  try {
    let text: string;
    let pageCount: number | undefined;

    if (mimeType === "application/pdf") {
      const extracted = await extractPdfText(buffer);
      text = extracted.text;
      pageCount = extracted.pageCount;
    } else if (
      mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      text = await extractDocxText(buffer);
    } else {
      text = buffer.toString("utf-8");
    }

    const trimmed = text.trim();

    if (trimmed.length === 0) {
      return toolFailure(
        createAppError({
          code: "NO_EXTRACTABLE_TEXT",
          category: "PARSING",
          severity: "ERROR",
          description: `No extractable text found in "${fileName}" (mime: ${mimeType})`,
          userMessage:
            mimeType === "application/pdf"
              ? "Este PDF parece ser uma imagem escaneada; OCR não é suportado nesta versão."
              : "Não foi possível extrair texto deste documento.",
          isRetryable: false,
          operation: "parseDocument",
        }),
      );
    }

    return toolSuccess({
      documentId: randomUUID(),
      fileName,
      mimeType,
      text: trimmed,
      pages: pageCount,
      metadata: {
        pageCount,
        hash: hashBuffer(buffer),
      },
    });
  } catch (cause) {
    return toolFailure(
      createAppError({
        code: "PARSING_FAILED",
        category: "PARSING",
        severity: "ERROR",
        description: `Failed to parse "${fileName}": ${cause instanceof Error ? cause.message : String(cause)}`,
        userMessage: "Não foi possível ler este arquivo. Verifique se ele não está corrompido.",
        isRetryable: false,
        operation: "parseDocument",
      }),
    );
  }
}
