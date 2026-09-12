"use client";

import { useState, useRef, type FormEvent } from "react";
import type { PipelineStageEvent } from "../lib/workflow/pipeline-stage-event";
import type { PipelineEvent, PipelineResultPayload } from "../lib/workflow/run-pipeline";
import {
  buildPipelineProgress,
  type PipelineProgressStep,
  type PipelineStepStatus,
} from "../lib/observability/pipeline-progress";
import { GLOSSARY, PROGRESS_GLOSSARY_KEYS } from "../lib/config/glossary";
import { readNdjson } from "../lib/streaming/ndjson";
import { ReportView } from "./report-view";
import { N8nExecutionView } from "./components/n8n-execution-view";
import { HelpHint } from "./components/help-hint";

type UploadSuccess = PipelineResultPayload;

interface UploadErrorBody {
  error?: { code?: string; userMessage?: string; description?: string };
}

/**
 * Um nó chega duas vezes: RUNNING quando começa e COMPLETED/FAILED quando termina. O casamento
 * é pelo `nodeDetail.id`, que o recorder mantém estável entre os dois — empilhar cegamente
 * mostraria cada etapa duplicada no inspector.
 */
function mergeStage(previous: PipelineStageEvent[], incoming: PipelineStageEvent): PipelineStageEvent[] {
  const id = incoming.nodeDetail?.id;
  const index = id ? previous.findIndex((event) => event.nodeDetail?.id === id) : -1;
  if (index === -1) return [...previous, incoming];
  const next = previous.slice();
  next[index] = incoming;
  return next;
}

export function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<UploadSuccess | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [liveStages, setLiveStages] = useState<PipelineStageEvent[]>([]);
  const [liveProgress, setLiveProgress] = useState<PipelineProgressStep[] | null>(null);
  const [liveRun, setLiveRun] = useState<{ runId: string; traceId: string } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  function handleCancel() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsSubmitting(false);
    setErrorMessage("Processamento cancelado pelo usuário.");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsSubmitting(true);
    setResult(null);
    setErrorMessage(null);
    setLiveStages([]);
    setLiveProgress(null);
    setLiveRun(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/documents", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      // Falhas anteriores à abertura do stream (arquivo ausente, credencial faltando) continuam
      // chegando como JSON único com status HTTP real.
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("ndjson") || !response.body) {
        const body = (await response.json()) as UploadErrorBody;
        setErrorMessage(
          body.error?.userMessage ?? body.error?.description ?? "Falha ao processar o arquivo.",
        );
        return;
      }

      let sawTerminalEvent = false;
      for await (const event of readNdjson<PipelineEvent>(response.body)) {
        switch (event.type) {
          case "start":
            setLiveRun({ runId: event.runId, traceId: event.traceId });
            break;
          case "stage":
            setLiveStages((previous) => mergeStage(previous, event.event));
            break;
          case "progress":
            setLiveProgress(event.steps);
            break;
          case "result":
            sawTerminalEvent = true;
            setResult(event.payload);
            break;
          case "error":
            sawTerminalEvent = true;
            setErrorMessage(
              event.error.userMessage ?? event.error.description ?? "Falha ao processar o arquivo.",
            );
            break;
        }
      }

      if (!sawTerminalEvent) {
        setErrorMessage("A conexão foi interrompida antes do fim da análise.");
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === "AbortError") {
        setErrorMessage("Processamento cancelado pelo usuário.");
      } else {
        setErrorMessage("Não foi possível conectar ao servidor. Tente novamente.");
      }
    } finally {
      setIsSubmitting(false);
      abortControllerRef.current = null;
    }
  }

  const [isN8nModalOpen, setIsN8nModalOpen] = useState(false);

  // `buildPipelineProgress({})` devolve a mesma lista "tudo pendente" que antes era uma constante
  // duplicada à mão aqui — e que, de quebra, citava um stage inexistente (SCRATCHPAD_SELECTION).
  const displayProgress =
    result?.progress ?? liveProgress ?? (isSubmitting ? buildPipelineProgress({}) : null);
  const hasFailure = displayProgress?.some((step) => step.status === "FAILED") ?? false;
  const timelineEvents = result?.stages ?? liveStages;
  const hasTimeline = timelineEvents.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="file"
          accept=".pdf,.docx,.txt"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="rounded-lg border border-ink-500 bg-ink-100 p-2 text-sm text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green dark:border-ink-500 dark:bg-ink-800 dark:text-ink-050"
        />
        <div className="flex gap-2">
          {isSubmitting ? (
            <div className="flex-1 flex gap-2">
              <button
                type="button"
                disabled
                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-brand-navy px-4 py-2 text-sm font-medium text-brand-cream opacity-80 dark:bg-ink-050 dark:text-brand-navy"
              >
                <LoadingSpinner />
                <span>Processando...</span>
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-lg bg-red-600 hover:bg-red-500 px-4 py-2 text-sm font-medium text-white shadow transition"
              >
                🚫 Cancelar
              </button>
            </div>
          ) : (
            <button
              type="submit"
              disabled={!file}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-brand-navy px-4 py-2 text-sm font-medium text-brand-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green disabled:opacity-40 dark:bg-ink-050 dark:text-brand-navy"
            >
              Enviar documento
            </button>
          )}
          {result || (hasTimeline && !isSubmitting) ? (
            <button
              type="button"
              onClick={() => setIsN8nModalOpen(true)}
              className="flex items-center justify-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-medium text-white shadow transition"
            >
              <span>🤖 Ver Delegação de Agentes</span>
            </button>
          ) : isSubmitting ? (
            <button
              type="button"
              onClick={() => setIsN8nModalOpen(true)}
              className="flex items-center justify-center gap-2 rounded-lg bg-indigo-900/60 hover:bg-indigo-900 text-indigo-200 border border-indigo-500/40 px-3 py-2 text-sm font-medium shadow transition"
            >
              <span>🤖 Acompanhar Agentes</span>
            </button>
          ) : null}
        </div>
      </form>

      {displayProgress && (
        <div className="flex flex-col gap-2 rounded-lg border border-ink-300 p-4 text-sm dark:border-ink-700">
          <div className="flex items-center justify-between mb-1">
            <span className="font-semibold text-ink-900 dark:text-ink-050">Progresso do Pipeline de Agentes</span>
            <button
              type="button"
              onClick={() => setIsN8nModalOpen(true)}
              className="text-xs bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 px-2.5 py-1 rounded font-medium flex items-center gap-1.5 transition"
            >
              <span>🤖 Abrir Orquestrador de Agentes</span>
            </button>
          </div>
          <ul className="flex flex-col gap-2">
            {displayProgress.map((step, index) => {
              // A etapa em curso é a primeira ainda não alcançada — mas só enquanto a execução
              // está viva: depois de uma falha, o giro do spinner mentiria sobre algo parado.
              const helpKey = PROGRESS_GLOSSARY_KEYS[index];
              const isCurrentStep =
                isSubmitting &&
                !hasFailure &&
                step.status === "PENDING" &&
                (index === 0 || displayProgress[index - 1]?.status !== "PENDING");
              return (
                <li key={`${step.stage}-${step.label}`} className="flex items-center gap-2.5">
                  {isCurrentStep ? (
                    <LoadingSpinner className="h-3.5 w-3.5 text-brand-navy dark:text-brand-cream" />
                  ) : (
                    <StatusDot status={step.status} />
                  )}
                  <span className={isCurrentStep ? "font-medium text-ink-900 dark:text-ink-050" : "text-ink-600 dark:text-ink-400"}>
                    {step.label}
                    {typeof step.count === "number" ? ` (${step.count})` : ""}
                  </span>
                  {helpKey && <HelpHint entry={GLOSSARY[helpKey]} status={step.status} />}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {errorMessage && (
        <p className="rounded-lg border border-danger bg-ink-100 p-3 text-sm text-danger dark:border-danger-dark dark:bg-ink-800 dark:text-danger-dark">
          {errorMessage}
        </p>
      )}

      {result && (
        <>
          <div className="rounded-lg border border-ink-300 p-4 text-sm dark:border-ink-700">
            <div className="flex items-center justify-between">
              <p className="font-medium">Documento processado</p>
              <button
                type="button"
                onClick={() => setIsN8nModalOpen(true)}
                className="px-3 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 rounded text-xs font-semibold transition flex items-center gap-1"
              >
                🤖 Visualizar Orquestração
              </button>
            </div>
            <p className="mt-1 text-ink-600 dark:text-ink-400">
              {result.fileName} · {result.metadata.pageCount ? `${result.metadata.pageCount} página(s)` : ""}
            </p>
            {result.provider && (
              <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-ink-600 dark:text-ink-400">
                <span>
                  Execução {result.runId} · {result.provider.llm}/{result.provider.model}
                </span>
                <HelpHint entry={GLOSSARY.execucaoLinha} />
                <span>· jurisprudência {result.provider.jurisprudence}</span>
                <HelpHint entry={GLOSSARY.fonteJurisprudencia} />
              </p>
            )}
            {result.scratchpads && (
              <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-600 dark:text-ink-400">
                <span>
                  Scratchpads: {result.scratchpads.processed}/{result.scratchpads.requested}
                  {result.scratchpads.failed > 0 ? ` · ${result.scratchpads.failed} falha(s)` : ""}
                </span>
                <HelpHint entry={GLOSSARY.scratchpadsRatio} />
              </p>
            )}
            {result.redactions.length > 0 && (
              <div className="mt-3">
                <p className="text-ink-600 dark:text-ink-400">Dados pessoais mascarados antes da análise:</p>
                <ul className="mt-1 list-disc pl-5">
                  {result.redactions.map((r) => (
                    <li key={`${r.type}-${r.marker}`}>
                      {r.marker} × {r.count}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <details className="mt-3">
              <summary className="cursor-pointer text-ink-600 dark:text-ink-400">Ver prévia do texto sanitizado</summary>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-ink-600 dark:text-ink-400">
                {result.sanitizedTextPreview}
              </pre>
            </details>
          </div>

          <ReportView report={result.report} />
        </>
      )}

      <N8nExecutionView
        isOpen={isN8nModalOpen}
        onClose={() => setIsN8nModalOpen(false)}
        events={timelineEvents}
        traceId={result?.traceId ?? liveRun?.traceId}
        runId={result?.runId ?? liveRun?.runId}
        isStreaming={isSubmitting}
      />
    </div>
  );
}

/**
 * Estado OPERACIONAL da etapa (§11.9) — aqui verde/vermelho são legítimos, porque descrevem a
 * execução, não resultado jurídico (docs/identidade-visual.md §5).
 *
 * O rótulo ao lado nomeia a etapa, mas não diz se ela terminou: sem o preenchimento vs. contorno e
 * sem o texto acessível, "concluída" e "pendente" seriam a mesma bolinha em escala de cinza e no
 * leitor de tela.
 */
function StatusDot({ status }: { status: PipelineStepStatus }) {
  // EMPTY fica em neutro de propósito: "rodou e não achou nada" costuma ser a regra
  // anti-alucinação funcionando, não defeito — pintar de vermelho acusaria a aplicação de um erro
  // que não houve. Só FAILED é vermelho, e ele existe justamente para não sobrar como pendente.
  const { shape, label } =
    status === "DONE"
      ? { shape: "bg-green-ink dark:bg-green-light", label: "concluída" }
      : status === "FAILED"
        ? { shape: "bg-danger dark:bg-danger-dark", label: "falhou" }
        : status === "EMPTY"
          ? { shape: "border-2 border-ink-500 bg-ink-500/40", label: "rodou sem resultado" }
          : { shape: "border-2 border-ink-500", label: "pendente" };
  return (
    <span role="img" aria-label={label} className={`h-2.5 w-2.5 shrink-0 rounded-full ${shape}`} />
  );
}

function LoadingSpinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
