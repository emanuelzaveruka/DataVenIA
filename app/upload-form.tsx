"use client";

import { useState, useRef, type FormEvent } from "react";
import type { FinalReport } from "../lib/schemas/report.schema";
import type { PipelineStageEvent } from "../lib/workflow/pipeline-stage-event";
import { ReportView } from "./report-view";
import { N8nExecutionView } from "./components/n8n-execution-view";

interface RedactionSummary {
  type: string;
  marker: string;
  count: number;
}

interface PipelineProgressStep {
  stage: string;
  label: string;
  count?: number;
  done: boolean;
}

interface UploadSuccess {
  runId: string;
  traceId: string;
  documentId: string;
  fileName: string;
  mimeType: string;
  metadata: { pageCount?: number; hash: string };
  sanitizedTextPreview: string;
  redactions: RedactionSummary[];
  stages?: PipelineStageEvent[];
  progress: PipelineProgressStep[];
  provider?: { llm: string; model: string; jurisprudence: string };
  scratchpads?: { requested: number; processed: number; failed: number; status: string };
  report: FinalReport;
}

interface UploadErrorBody {
  error: { code?: string; userMessage?: string; description?: string };
}

const PENDING_PROGRESS: PipelineProgressStep[] = [
  { stage: "INGESTION", label: "Documento processado", done: false },
  { stage: "QUERY_GENERATION", label: "Queries de pesquisa geradas", done: false },
  { stage: "SEARCH", label: "Candidatos encontrados", done: false },
  { stage: "SCRATCHPAD_SELECTION", label: "Decisões selecionadas para análise profunda", done: false },
  { stage: "SCRATCHPAD_GENERATION", label: "Scratchpads válidos", done: false },
  { stage: "CROSS_FILE_ANALYSIS", label: "Análise cruzada concluída", done: false },
  { stage: "EVIDENCE_VERIFICATION", label: "Evidências verificadas na fonte oficial", done: false },
  { stage: "REPORT_GENERATION", label: "Relatório pronto", done: false },
];

export function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<UploadSuccess | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/documents", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      const body = (await response.json()) as UploadSuccess | UploadErrorBody;

      if (!response.ok || "error" in body) {
        const message =
          "error" in body
            ? body.error.userMessage ?? body.error.description ?? "Falha ao processar o arquivo."
            : "Falha ao processar o arquivo.";
        setErrorMessage(message);
        return;
      }

      setResult(body);
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

  const displayProgress = result?.progress ?? (isSubmitting ? PENDING_PROGRESS : null);

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
          {result && (
            <button
              type="button"
              onClick={() => setIsN8nModalOpen(true)}
              className="flex items-center gap-2 rounded-lg bg-orange-600 hover:bg-orange-500 px-4 py-2 text-sm font-medium text-white shadow transition"
            >
              <span>⚡ Ver Execução (N8n Style)</span>
            </button>
          )}
        </div>
      </form>

      {displayProgress && (
        <div className="flex flex-col gap-2 rounded-lg border border-ink-300 p-4 text-sm dark:border-ink-700">
          <div className="flex items-center justify-between mb-1">
            <span className="font-semibold text-ink-900 dark:text-ink-050">Progresso do Pipeline</span>
            <button
              type="button"
              onClick={() => setIsN8nModalOpen(true)}
              className="text-xs bg-orange-500/10 hover:bg-orange-500/20 text-orange-500 border border-orange-500/30 px-2 py-1 rounded font-medium flex items-center gap-1 transition"
            >
              <span>⚡ Abrir N8n Inspector</span>
            </button>
          </div>
          <ul className="flex flex-col gap-2">
            {displayProgress.map((step, index) => {
              const isCurrentStep = isSubmitting && !step.done && (index === 0 || displayProgress[index - 1]?.done);
              return (
                <li key={`${step.stage}-${step.label}`} className="flex items-center gap-2.5">
                  {isCurrentStep ? (
                    <LoadingSpinner className="h-3.5 w-3.5 text-brand-navy dark:text-brand-cream" />
                  ) : (
                    <StatusDot status={step.done ? "COMPLETED" : undefined} />
                  )}
                  <span className={isCurrentStep ? "font-medium text-ink-900 dark:text-ink-050" : "text-ink-600 dark:text-ink-400"}>
                    {step.label}
                    {typeof step.count === "number" ? ` (${step.count})` : ""}
                  </span>
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
                className="px-3 py-1 bg-orange-500/10 hover:bg-orange-500/20 text-orange-500 border border-orange-500/30 rounded text-xs font-semibold transition"
              >
                ⚡ Abrir N8n Inspector
              </button>
            </div>
            <p className="mt-1 text-ink-600 dark:text-ink-400">
              {result.fileName} · {result.metadata.pageCount ? `${result.metadata.pageCount} página(s)` : ""}
            </p>
            {result.provider && (
              <p className="mt-2 text-xs text-ink-600 dark:text-ink-400">
                Execução {result.runId} · {result.provider.llm}/{result.provider.model} · jurisprudência{" "}
                {result.provider.jurisprudence}
              </p>
            )}
            {result.scratchpads && (
              <p className="mt-1 text-xs text-ink-600 dark:text-ink-400">
                Scratchpads: {result.scratchpads.processed}/{result.scratchpads.requested}
                {result.scratchpads.failed > 0 ? ` · ${result.scratchpads.failed} falha(s)` : ""}
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
        events={result?.stages || []}
        traceId={result?.traceId}
        runId={result?.runId}
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
function StatusDot({ status }: { status: "COMPLETED" | "FAILED" | undefined }) {
  const { shape, label } =
    status === "COMPLETED"
      ? { shape: "bg-green-ink dark:bg-green-light", label: "concluída" }
      : status === "FAILED"
        ? { shape: "bg-danger dark:bg-danger-dark", label: "falhou" }
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
