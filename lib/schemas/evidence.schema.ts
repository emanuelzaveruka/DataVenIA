import { z } from "zod";

/**
 * Como a citação foi localizada no texto original (HU-24: "presença literal (ou near-literal)").
 * Não faz parte do contrato de §3.9 — é metadado de auditoria da verificação, para que o motivo de
 * um `verified: false` nunca fique implícito.
 */
export const EVIDENCE_MATCH_KINDS = ["EXACT", "ELIDED", "NEAR_LITERAL", "NOT_FOUND", "SOURCE_CHANGED"] as const;
export type EvidenceMatchKind = (typeof EVIDENCE_MATCH_KINDS)[number];

export const VerifiedEvidenceSourceSchema = z.object({
  processNumber: z.string().optional(),
  court: z.string().optional(),
  chamber: z.string().optional(),
  judge: z.string().optional(),
  judgmentDate: z.string().optional(),
  url: z.string().url(),
  sourceHash: z.string().min(1),
});

/**
 * Contrato de Evidence Verification (contexto-geral.md §3.9). É produzido inteiramente em código:
 * a etapa VERIFY do §2.3 apenas confere se a citação existe de fato na fonte reaberta — nunca
 * chama modelo, nunca decide "quem ganha".
 */
export const VerifiedEvidenceSchema = z.object({
  evidenceId: z.string().min(1),
  scratchpadId: z.string().min(1),
  proposition: z.string().min(1),
  quote: z.string().min(1),
  context: z.string().min(1),
  source: VerifiedEvidenceSourceSchema,
  verified: z.boolean(),
  matchKind: z.enum(EVIDENCE_MATCH_KINDS),
  similarity: z.number().min(0).max(1),
});
export type VerifiedEvidence = z.infer<typeof VerifiedEvidenceSchema>;
