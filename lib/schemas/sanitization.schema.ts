import { z } from "zod";

export const REDACTION_TYPES = [
  "CPF_CNPJ",
  "EMAIL",
  "PHONE",
  "CEP",
  "ADDRESS",
  "PARTY_NAME",
] as const;

export type RedactionType = (typeof REDACTION_TYPES)[number];

/**
 * Nunca inclui o dado original — apenas tipo, marcador usado e contagem, para permitir
 * auditoria sem reexpor a informação sensível (HU-05).
 */
export const RedactionSummarySchema = z.object({
  type: z.enum(REDACTION_TYPES),
  marker: z.string(),
  count: z.number().int().positive(),
});

export type RedactionSummary = z.infer<typeof RedactionSummarySchema>;

export const SanitizedDocumentSchema = z.object({
  documentId: z.string(),
  sanitizedText: z.string(),
  redactions: z.array(RedactionSummarySchema),
});

export type SanitizedDocument = z.infer<typeof SanitizedDocumentSchema>;
