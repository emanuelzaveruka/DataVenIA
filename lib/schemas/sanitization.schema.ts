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

/**
 * Ocorrência individual mascarada, para auditoria (§14). Diferente de `RedactionSummary`, que é o
 * que o pipeline sempre produz e persiste, isto só existe quando o modo auditoria está ligado e
 * **nunca** é gravado no repositório: é material para conferir à mão se o detector pegou o que
 * devia num documento real.
 *
 * `original` só é preenchido no nível `full` de `PIPELINE_AUDIT` — é o único campo do projeto que
 * carrega dado pessoal não mascarado, e por isso mora atrás de um nível próprio.
 *
 * `start` é a posição no texto **como ele estava naquela passada** do sanitizador, não no texto
 * final: a sanitização é uma sequência de substituições e cada uma desloca o que vem depois.
 * Para conferência humana o que vale é `context`, que mostra a ocorrência dentro da frase.
 */
export const RedactionSpanSchema = z.object({
  type: z.enum(REDACTION_TYPES),
  marker: z.string(),
  start: z.number().int().nonnegative(),
  length: z.number().int().positive(),
  context: z.string(),
  original: z.string().optional(),
});

export type RedactionSpan = z.infer<typeof RedactionSpanSchema>;

export const SanitizedDocumentSchema = z.object({
  documentId: z.string(),
  sanitizedText: z.string(),
  redactions: z.array(RedactionSummarySchema),
});

export type SanitizedDocument = z.infer<typeof SanitizedDocumentSchema>;
