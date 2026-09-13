import { z } from "zod";

export const SUPPORTED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
] as const;

export type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[number];

export const ParsedDocumentSchema = z.object({
  documentId: z.string(),
  fileName: z.string(),
  mimeType: z.enum(SUPPORTED_MIME_TYPES),
  text: z.string().min(1),
  pages: z.number().int().positive().optional(),
  /**
   * Texto por página, só no modo auditoria (§14). Ausente no caminho normal: o pipeline analisa o
   * documento inteiro e guardar a divisão custaria memória sem ninguém consumi-la.
   */
  pageTexts: z.array(z.string()).optional(),
  metadata: z.object({
    pageCount: z.number().int().positive().optional(),
    hash: z.string(),
  }),
});

export type ParsedDocument = z.infer<typeof ParsedDocumentSchema>;
