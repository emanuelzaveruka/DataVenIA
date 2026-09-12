import type { WorkflowStage } from "../workflow/state-machine";

/**
 * Estado de uma etapa do progresso.
 *
 * `EMPTY` existe porque "não cheguei aqui" e "cheguei e não produzi nada" são fatos diferentes e
 * respondem perguntas diferentes do usuário. O input já distinguia os dois (`undefined` vs. `0`) —
 * o que faltava era não colapsar a distinção na saída: com `done: boolean`, uma execução que
 * terminou sem nenhuma citação conferida ficava visualmente idêntica a uma que parou antes da
 * verificação, e a única leitura possível era "travou".
 *
 * `RUNNING` não existe aqui de propósito: esta é uma função pura sobre contagens, sem noção de
 * tempo — quem renderiza infere a etapa em curso a partir do primeiro `PENDING`.
 */
export type PipelineStepStatus = "PENDING" | "DONE" | "EMPTY" | "FAILED";

export interface PipelineProgressStep {
  stage: WorkflowStage | "INGESTION";
  label: string;
  /** Quantidade que a etapa produziu (N queries, N candidatos, N Scratchpads válidos...). */
  count?: number;
  status: PipelineStepStatus;
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
  /** A execução terminou em erro: a primeira etapa não concluída é onde ela parou. */
  failed?: boolean;
}

/** Etapa contável: `undefined` = não alcançada, `0` = rodou sem resultado, `> 0` = concluída. */
function fromCount(count: number | undefined): PipelineStepStatus {
  if (count === undefined) return "PENDING";
  return count > 0 ? "DONE" : "EMPTY";
}

/** Etapa sem contagem: só existe alcançada (`true`) ou não. */
function fromFlag(flag: boolean | undefined): PipelineStepStatus {
  return flag === true ? "DONE" : "PENDING";
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
  const steps: PipelineProgressStep[] = [
    {
      stage: "INGESTION",
      label: "Documento processado",
      status: fromFlag(input.documentParsed),
    },
    {
      stage: "QUERY_GENERATION",
      label: "Queries de pesquisa geradas",
      count: input.queriesGenerated,
      status: fromCount(input.queriesGenerated),
    },
    {
      stage: "SEARCH",
      label: "Candidatos encontrados",
      count: input.candidatesFound,
      status: fromCount(input.candidatesFound),
    },
    {
      stage: "SCRATCHPAD_GENERATION",
      label: "Decisões selecionadas para análise profunda",
      count: input.decisionsSelected,
      status: fromCount(input.decisionsSelected),
    },
    {
      stage: "SCRATCHPAD_GENERATION",
      label: "Scratchpads válidos",
      count: input.validScratchpads,
      status: fromCount(input.validScratchpads),
    },
    {
      stage: "CROSS_FILE_ANALYSIS",
      label: "Análise cruzada concluída",
      status: fromFlag(input.crossFileComplete),
    },
    {
      stage: "EVIDENCE_VERIFICATION",
      label: "Evidências verificadas na fonte oficial",
      count: input.verifiedEvidences,
      status: fromCount(input.verifiedEvidences),
    },
    {
      stage: "REPORT_GENERATION",
      label: "Relatório pronto",
      status: fromFlag(input.reportReady),
    },
  ];

  // A falha marca *uma* etapa, a primeira que não concluiu: é onde a execução parou. As seguintes
  // continuam pendentes porque nunca foram tentadas — pintar todas de vermelho diria que oito
  // coisas quebraram quando quebrou uma.
  if (input.failed) {
    const stopped = steps.find((step) => step.status !== "DONE");
    if (stopped) stopped.status = "FAILED";
  }

  return steps;
}
