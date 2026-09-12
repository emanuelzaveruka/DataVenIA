export type PipelineStageStatus = "COMPLETED" | "FAILED";

export interface PipelineStageEvent {
  stage: string;
  status: PipelineStageStatus;
  label: string;
  durationMs: number;
}

/**
 * Log de progresso exibido ao usuário (HU-04). Nesta fase o pipeline de ingestão é síncrono e
 * rápido (sem chamada a modelo), então o log chega completo numa única resposta; observabilidade
 * incremental/streaming real (§11.9) entra na Fase 8 com HU-35.
 */
export function createStageRecorder() {
  const events: PipelineStageEvent[] = [];

  return {
    events,
    record(stage: string, label: string, status: PipelineStageStatus, startedAt: number): void {
      events.push({ stage, label, status, durationMs: Date.now() - startedAt });
    },
  };
}
