"use client";

import { useState, type FormEvent } from "react";

interface StageEvent {
  stage: string;
  label: string;
  status: "COMPLETED" | "FAILED";
  durationMs: number;
}

interface RedactionSummary {
  type: string;
  marker: string;
  count: number;
}

interface UploadSuccess {
  documentId: string;
  fileName: string;
  mimeType: string;
  metadata: { pageCount?: number; hash: string };
  sanitizedTextPreview: string;
  redactions: RedactionSummary[];
  stages: StageEvent[];
}

interface UploadErrorBody {
  error: { code?: string; userMessage?: string; description?: string };
}

const PENDING_STAGES: { stage: string; label: string }[] = [
  { stage: "RECEIVED", label: "Arquivo recebido" },
  { stage: "VALIDATING", label: "Validando arquivo" },
  { stage: "PARSING", label: "Extraindo texto" },
  { stage: "SANITIZING", label: "Sanitizando dados pessoais" },
];

export function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stages, setStages] = useState<StageEvent[] | null>(null);
  const [result, setResult] = useState<UploadSuccess | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;

    setIsSubmitting(true);
    setStages(null);
    setResult(null);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/documents", { method: "POST", body: formData });
      const body = (await response.json()) as UploadSuccess | UploadErrorBody;

      if (!response.ok || "error" in body) {
        const message =
          "error" in body
            ? body.error.userMessage ?? body.error.description ?? "Falha ao processar o arquivo."
            : "Falha ao processar o arquivo.";
        setErrorMessage(message);
        return;
      }

      setStages(body.stages);
      setResult(body);
    } catch {
      setErrorMessage("Não foi possível conectar ao servidor. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const displayStages = stages ?? (isSubmitting ? PENDING_STAGES.map((s) => ({ ...s, status: undefined })) : null);

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="file"
          accept=".pdf,.docx,.txt"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="rounded-lg border border-neutral-300 p-2 text-sm dark:border-neutral-700"
        />
        <button
          type="submit"
          disabled={!file || isSubmitting}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {isSubmitting ? "Processando..." : "Enviar documento"}
        </button>
      </form>

      {displayStages && (
        <ul className="flex flex-col gap-1 text-sm">
          {displayStages.map((stage) => (
            <li key={stage.stage} className="flex items-center gap-2">
              <StatusDot status={stage.status} />
              <span>{stage.label}</span>
            </li>
          ))}
        </ul>
      )}

      {errorMessage && (
        <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
          {errorMessage}
        </p>
      )}

      {result && (
        <div className="rounded-lg border border-neutral-300 p-4 text-sm dark:border-neutral-700">
          <p className="font-medium">Documento processado</p>
          <p className="mt-1 text-neutral-500">
            {result.fileName} · {result.metadata.pageCount ? `${result.metadata.pageCount} página(s)` : ""}
          </p>
          {result.redactions.length > 0 && (
            <div className="mt-3">
              <p className="text-neutral-500">Dados pessoais mascarados antes da análise:</p>
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
            <summary className="cursor-pointer text-neutral-500">Ver prévia do texto sanitizado</summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-neutral-600 dark:text-neutral-400">
              {result.sanitizedTextPreview}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}

function StatusDot({ status }: { status: "COMPLETED" | "FAILED" | undefined }) {
  const color =
    status === "COMPLETED"
      ? "bg-emerald-500"
      : status === "FAILED"
        ? "bg-red-500"
        : "bg-neutral-300 dark:bg-neutral-600";
  return <span className={`h-2 w-2 rounded-full ${color}`} />;
}
