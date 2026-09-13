import { randomUUID } from "node:crypto";
import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";
import { createAppError } from "../../errors/app-error";
import { toolFailure, toolSuccess, type ToolResult } from "../../errors/tool-result";
import { hashBuffer } from "./hash";
import type { ParsedDocument, SupportedMimeType } from "../../schemas/document.schema";

/**
 * `perPage` existe para o modo auditoria (§14): com o texto junto não dá para distinguir um PDF
 * lido por inteiro de um cuja metade das páginas é imagem escaneada — o total de caracteres parece
 * plausível nos dois casos. Página a página, uma página vazia no meio denuncia o problema.
 *
 * O caminho normal continua em `mergePages: true`: é uma chamada a menos de junção e o pipeline
 * não tem o que fazer com o array.
 */
async function extractPdfText(
  buffer: Buffer,
  perPage: boolean,
): Promise<{ text: string; pageCount: number; pageTexts?: string[] }> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));

  if (!perPage) {
    const { text, totalPages } = await extractText(pdf, { mergePages: true });
    return { text, pageCount: totalPages };
  }

  const { text, totalPages } = await extractText(pdf, { mergePages: false });
  return { text: text.join("\n\n"), pageCount: totalPages, pageTexts: text };
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

export async function parseDocument(
  buffer: Buffer,
  fileName: string,
  mimeType: SupportedMimeType,
  options: { perPage?: boolean } = {},
): Promise<ToolResult<ParsedDocument>> {
  try {
    let text: string;
    let pageCount: number | undefined;
    let pageTexts: string[] | undefined;

    if (mimeType === "application/pdf") {
      const extracted = await extractPdfText(buffer, options.perPage === true);
      text = extracted.text;
      pageCount = extracted.pageCount;
      pageTexts = extracted.pageTexts;
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
      pageTexts,
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
