import type { WorkflowStage } from "../workflow/state-machine";

export interface PipelineProgressStep {
  stage: WorkflowStage | "INGESTION";
  label: string;
  /** Quantidade que a etapa produziu (N queries, N candidatos, N Scratchpads válidos...). */
  count?: number;
  done: boolean;
}

export interface PipelineProgressInput {
  documentParsed?: boolean;
  queriesGenerated?: number;
  candidatesFound?: number;
  decisionsSelected?: number;
  validScratchpads?: number;
  crossFileComplete?: boolean;
  verifiedEvidences?: number;
  reportReady?: boolean;
}

/**
 * Progresso etapa a etapa exigido por §11.9/HU-35 — "documento processado, N queries geradas, N
 * candidatos encontrados, N decisões selecionadas, N Scratchpads válidos, cross-file completo, N
 * evidências verificadas, relatório pronto".
 *
 * É função pura sobre contagens, não um observador acoplado ao pipeline: quem tem os artefatos
 * (a rota, a página, um teste) monta a lista sem que nenhum serviço precise reportar progresso.
 * Complementa `pipeline-stage-event.ts` (Fase 1), que mede duração por etapa da ingestão; aqui o
 * que importa é *o que* cada etapa produziu.
 *
 * Uma etapa sem informação aparece como não concluída em vez de sumir da lista: o usuário precisa
 * ver onde o pipeline parou, e uma lista que encolhe esconde exatamente isso.
 */
export function buildPipelineProgress(input: PipelineProgressInput): PipelineProgressStep[] {
  return [
    {
      stage: "INGESTION",
      label: "Documento processado",
      done: input.documentParsed === true,
    },
    {
      stage: "QUERY_GENERATION",
      label: "Queries de pesquisa geradas",
      count: input.queriesGenerated,
      done: (input.queriesGenerated ?? 0) > 0,
    },
    {
      stage: "SEARCH",
      label: "Candidatos encontrados",
      count: input.candidatesFound,
      done: (input.candidatesFound ?? 0) > 0,
    },
    {
      stage: "SCRATCHPAD_GENERATION",
      label: "Decisões selecionadas para análise profunda",
      count: input.decisionsSelected,
      done: (input.decisionsSelected ?? 0) > 0,
    },
    {
      stage: "SCRATCHPAD_GENERATION",
      label: "Scratchpads válidos",
      count: input.validScratchpads,
      done: (input.validScratchpads ?? 0) > 0,
    },
    {
      stage: "CROSS_FILE_ANALYSIS",
      label: "Análise cruzada concluída",
      done: input.crossFileComplete === true,
    },
    {
      stage: "EVIDENCE_VERIFICATION",
      label: "Evidências verificadas na fonte oficial",
      count: input.verifiedEvidences,
      done: (input.verifiedEvidences ?? 0) > 0,
    },
    {
      stage: "REPORT_GENERATION",
      label: "Relatório pronto",
      done: input.reportReady === true,
    },
  ];
}
