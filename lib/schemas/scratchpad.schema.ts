import { z } from "zod";

/**
 * Versão do contrato `DecisionScratchpad` (contexto-geral.md §11.6) — cada Scratchpad guarda a
 * versão do schema com que foi produzido, para permitir idempotência/cache quando a Fase 8
 * introduzir persistência real.
 */
export const SCRATCHPAD_SCHEMA_VERSION = "1.0.0";

export const HOLDING_STANCES = ["SUPPORTS", "OPPOSES", "NEUTRAL", "MIXED"] as const;
export type HoldingStance = (typeof HOLDING_STANCES)[number];

export const SCRATCHPAD_STATUSES = ["VALID", "PARTIAL", "FAILED"] as const;
export type ScratchpadStatus = (typeof SCRATCHPAD_STATUSES)[number];

export const HoldingSchema = z.object({
  proposition: z.string().min(1),
  stance: z.enum(HOLDING_STANCES),
  reasoning: z.string().min(1),
});
export type Holding = z.infer<typeof HoldingSchema>;

export const EvidenceCandidateSchema = z.object({
  id: z.string().min(1),
  quote: z.string().min(1),
  context: z.string().min(1),
  purpose: z.string().min(1),
  sourceLocation: z.string().optional(),
});
export type EvidenceCandidate = z.infer<typeof EvidenceCandidateSchema>;

/**
 * O que o modelo produz: o trecho, sem o `id`. Pela mesma razão do `id` da questão jurídica
 * (`case-analysis.schema.ts`), o identificador é atribuído em código: é por ele que a análise
 * cruzada aponta a citação que sustenta um risco (HU-23) e que a verificação reabre a fonte
 * (HU-24), e um id inventado a cada execução não dá ao modelo seguinte nenhum padrão a seguir.
 */
export const EvidenceCandidateContentSchema = EvidenceCandidateSchema.omit({ id: true });
export type EvidenceCandidateContent = z.infer<typeof EvidenceCandidateContentSchema>;

/**
 * `EV-<prefixo do scratchpad>-<n>`: único entre Scratchpads (o prefixo vem do `scratchpadId`, que
 * é um UUID próprio de cada um) e visivelmente distinto de um `scratchpadId`, que é o outro
 * identificador que circula no mesmo prompt. Derivar do `scratchpadId`, e não da posição da
 * decisão no lote, é o que mantém a unicidade quando um Scratchpad vem do cache de HU-33 e outro é
 * gerado agora.
 */
export function evidenceCandidateId(scratchpadId: string, index: number): string {
  return `EV-${scratchpadId.replace(/-/g, "").slice(0, 6)}-${index + 1}`;
}

export const RelevanceSchema = z.object({
  score: z.number(),
  reason: z.string().min(1),
});

/**
 * Identificação da fonte (contexto-geral.md §3.6) — nunca produzida pelo modelo (D4 do plano):
 * `sourceHash` é um digest real do texto efetivamente buscado, e os demais campos já são
 * conhecidos antes da chamada ao modelo (vêm do `RawDecision`/`JurisprudenceSearchItem`).
 */
export const ScratchpadSourceSchema = z.object({
  provider: z.literal("TJPR"),
  sourceId: z.string().min(1),
  url: z.string().url(),
  processNumber: z.string().optional(),
  court: z.string().optional(),
  chamber: z.string().optional(),
  judge: z.string().optional(),
  judgmentDate: z.string().optional(),
  sourceHash: z.string().min(1),
});
export type ScratchpadSource = z.infer<typeof ScratchpadSourceSchema>;

/**
 * Campos que o modelo é responsável por produzir para uma única decisão (HU-17: nunca mais de uma
 * decisão por chamada).
 */
const ScratchpadContentShape = z.object({
  relevance: RelevanceSchema,
  caseSummary: z.string().min(1),
  facts: z.array(z.string()),
  legalIssues: z.array(z.string()),
  holdings: z.array(HoldingSchema),
  favorablePoints: z.array(z.string()),
  contraryPoints: z.array(z.string()),
  distinguishingFacts: z.array(z.string()),
  citedLaws: z.array(z.string()),
  citedPrecedents: z.array(z.string()),
  evidenceCandidates: z.array(EvidenceCandidateContentSchema),
  confidence: z.number().min(0).max(1),
  status: z.enum(SCRATCHPAD_STATUSES),
});

/**
 * HU-18 — regra fundamental: a classificação nunca é um rótulo único por decisão inteira. Um
 * Scratchpad com `holdings` vazio mas `status: "VALID"` é inconsistente: uma análise que não
 * identificou nenhuma proposição relevante deve se declarar PARTIAL/FAILED, nunca VALID.
 */
function rejectEmptyHoldingsWhenValid(
  data: { holdings: unknown[]; status: ScratchpadStatus },
  ctx: z.RefinementCtx,
): void {
  if (data.holdings.length === 0 && data.status === "VALID") {
    ctx.addIssue({
      code: "custom",
      path: ["holdings"],
      message:
        'holdings não pode ser vazio quando status é "VALID" (HU-18: cada proposição jurídica precisa de um stance próprio).',
    });
  }
}

export const ScratchpadContentSchema = ScratchpadContentShape.superRefine(rejectEmptyHoldingsWhenValid);
export type ScratchpadContent = z.infer<typeof ScratchpadContentShape>;

/**
 * Contrato completo (contexto-geral.md §3.6) — estende o conteúdo produzido pelo modelo com os
 * campos montados em código após a chamada (scratchpadId, schemaVersion, source).
 */
const ScratchpadShape = ScratchpadContentShape.extend({
  scratchpadId: z.string().min(1),
  schemaVersion: z.string().min(1),
  source: ScratchpadSourceSchema,
  // Os trechos voltam aqui com o `id` que `generateScratchpad` atribuiu — mesma relação de
  // `source` e `scratchpadId` com o conteúdo do modelo.
  evidenceCandidates: z.array(EvidenceCandidateSchema),
});

export const ScratchpadSchema = ScratchpadShape.superRefine(rejectEmptyHoldingsWhenValid);
export type DecisionScratchpad = z.infer<typeof ScratchpadShape>;
