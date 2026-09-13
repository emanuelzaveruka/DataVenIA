import { randomUUID } from "node:crypto";
import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";
import { createAppError } from "../../errors/app-error";
import { toolFailure, toolSuccess, type ToolResult } from "../../errors/tool-result";
import { hashBuffer } from "./hash";
import { MIN_PDF_CHARS_PER_PAGE } from "../../config/limits";
import type { ParsedDocument, SupportedMimeType } from "../../schemas/document.schema";

export function isLowTextDensityPdf(charCount: number, pageCount: number): boolean {
  return charCount / Math.max(pageCount, 1) < MIN_PDF_CHARS_PER_PAGE;
}

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

    if (
      mimeType === "application/pdf" &&
      pageCount !== undefined &&
      isLowTextDensityPdf(trimmed.length, pageCount)
    ) {
      return toolFailure(
        createAppError({
          code: "LOW_TEXT_DENSITY_PDF",
          category: "PARSING",
          severity: "ERROR",
          description: `Low text density in "${fileName}": ${trimmed.length} chars across ${pageCount} page(s) (below ${MIN_PDF_CHARS_PER_PAGE} chars/page)`,
          userMessage:
            "Este PDF parece conter páginas de imagem ou digitalizadas: foi extraído muito pouco texto para o número de páginas. Se o documento for escaneado, gere uma versão com OCR (texto selecionável) antes de enviar.",
          isRetryable: false,
          operation: "parseDocument",
          metadata: { fileName, pageCount, extractedChars: trimmed.length },
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
