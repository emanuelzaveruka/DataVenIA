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
import { Cartao } from "@/components/ui/cartao";
import { Botao } from "@/components/ui/botao";
import { Rotulo } from "@/components/ui/rotulo";
import { Marcador } from "@/components/ui/marcador";
import { Dropzone } from "@/components/ui/dropzone";
import { EscopoDaBusca, inicioDoPeriodo } from "@/components/envio/escopo-da-busca";

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

  // Escopo escolhido antes de analisar. Mora aqui, e não no painel, porque é o envio que
  // precisa dele — o painel só edita.
  const [termos, setTermos] = useState<string[]>([]);
  const [camara, setCamara] = useState("");
  const [periodo, setPeriodo] = useState(0);

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
      if (termos.length > 0) formData.append("terms", JSON.stringify(termos));
      if (camara) formData.append("judgingBody", camara);
      const inicio = inicioDoPeriodo(periodo);
      if (inicio) formData.append("periodStart", inicio);

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
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {/* coluna principal — envio e execução */}
        <div className="flex flex-col gap-5">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Dropzone
              arquivo={file}
              onArquivo={(novo) => {
                // Sugestão pertence ao arquivo que a gerou: trocar a peça sem limpar deixaria
                // termos do documento anterior irem junto na busca do novo.
                setFile(novo);
                setTermos([]);
              }}
              desabilitado={isSubmitting}
            />

            <div className="flex flex-wrap gap-2">
              {isSubmitting ? (
                <>
                  <Botao type="button" variante="primaria" disabled className="flex-1">
                    <LoadingSpinner />
                    <span>Processando…</span>
                  </Botao>
                  <Botao type="button" variante="secundaria" onClick={handleCancel}>
                    Cancelar
                  </Botao>
                </>
              ) : (
                <Botao type="submit" variante="primaria" disabled={!file} className="flex-1">
                  Enviar documento
                </Botao>
              )}

              {result || hasTimeline ? (
                <Botao type="button" variante="secundaria" onClick={() => setIsN8nModalOpen(true)}>
                  {isSubmitting ? "Acompanhar agentes" : "Ver delegação de agentes"}
                </Botao>
              ) : null}
            </div>
          </form>

          {displayProgress && (
            // sem `overflow-hidden`: o painel do HelpHint e absolute e estoura o card de
            // proposito — recortar aqui esconderia justamente a explicacao da etapa.
            <Cartao>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-vn-borda px-6 py-5">
                <Rotulo>Execução do pipeline</Rotulo>
                <Marcador tom={hasFailure ? "improcedente" : isSubmitting ? "parcial" : "procedente"}>
                  {hasFailure ? "Falhou" : isSubmitting ? "Processando" : "Concluído"}
                </Marcador>
              </div>

              <ol className="flex flex-col gap-4 px-6 py-6">
                {displayProgress.map((step, index) => {
                  // A etapa em curso é a primeira ainda não alcançada — mas só enquanto a execução
                  // está viva: depois de uma falha, o giro do spinner mentiria sobre algo parado.
                  //
                  // O glossário é indexado por POSIÇÃO contra esta lista (PROGRESS_GLOSSARY_KEYS).
                  // Reordenar as etapas aqui faz o "?" explicar a etapa errada, em silêncio.
                  const helpKey = PROGRESS_GLOSSARY_KEYS[index];
                  const isCurrentStep =
                    isSubmitting &&
                    !hasFailure &&
                    step.status === "PENDING" &&
                    (index === 0 || displayProgress[index - 1]?.status !== "PENDING");
                  return (
                    <li key={`${step.stage}-${step.label}`} className="flex items-start gap-3.5">
                      {isCurrentStep ? (
                        <LoadingSpinner className="mt-0.5 h-4 w-4 text-vn-acao" />
                      ) : (
                        <StatusMarca status={step.status} />
                      )}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={
                            isCurrentStep
                              ? "text-apoio font-semibold text-vn-texto"
                              : "text-apoio text-vn-texto-suave"
                          }
                        >
                          {step.label}
                          {typeof step.count === "number" ? (
                            <span className="num font-semibold text-vn-texto"> ({step.count})</span>
                          ) : (
                            ""
                          )}
                        </span>
                        {helpKey && <HelpHint entry={GLOSSARY[helpKey]} status={step.status} />}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </Cartao>
          )}

          {errorMessage && (
            <Cartao className="border-l-[3px] border-l-vn-critico p-5">
              <p className="text-apoio leading-relaxed text-vn-texto">{errorMessage}</p>
            </Cartao>
          )}
        </div>

        {/* coluna lateral — escopo e privacidade */}
        <div className="flex flex-col gap-5">
          <EscopoDaBusca
            arquivo={file}
            termos={termos}
            onTermosChange={setTermos}
            camara={camara}
            onCamaraChange={setCamara}
            periodo={periodo}
            onPeriodoChange={setPeriodo}
            desabilitado={isSubmitting}
          />

          {/* uso funcional da cor de informação: é contexto, não alerta */}
          <Cartao className="border-l-[3px] border-l-vn-info p-6">
            <h3 className="mb-2 text-apoio font-bold">O que sai do seu documento</h3>
            <p className="text-rotulo leading-relaxed text-vn-texto-suave">
              CPF/CNPJ, endereço, telefone, e-mail e nomes de partes não essenciais são substituídos
              antes de a peça seguir para análise. Os dados da sessão são descartados ao fechar o
              navegador.
            </p>
          </Cartao>
        </div>
      </div>

      {result && (
        <div className="flex flex-col gap-6">
          <Cartao className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Rotulo>Documento processado</Rotulo>
              <Botao type="button" variante="texto" onClick={() => setIsN8nModalOpen(true)}>
                Visualizar orquestração
              </Botao>
            </div>

            <p className="mt-3 text-apoio text-vn-texto">
              {result.fileName}
              {result.metadata.pageCount ? (
                <span className="num text-vn-texto-suave"> · {result.metadata.pageCount} página(s)</span>
              ) : null}
            </p>

            {result.provider && (
              <p className="mt-2 flex flex-wrap items-center gap-1.5 text-legenda text-vn-texto-suave">
                <span className="num">
                  Execução {result.runId} · {result.provider.llm}/{result.provider.model}
                </span>
                <HelpHint entry={GLOSSARY.execucaoLinha} />
                <span>· jurisprudência {result.provider.jurisprudence}</span>
                <HelpHint entry={GLOSSARY.fonteJurisprudencia} />
              </p>
            )}

            {result.scratchpads && (
              <p className="mt-1 flex flex-wrap items-center gap-1.5 text-legenda text-vn-texto-suave">
                <span className="num">
                  Scratchpads: {result.scratchpads.processed}/{result.scratchpads.requested}
                  {result.scratchpads.failed > 0 ? ` · ${result.scratchpads.failed} falha(s)` : ""}
                </span>
                <HelpHint entry={GLOSSARY.scratchpadsRatio} />
              </p>
            )}

            {result.redactions.length > 0 && (
              <div className="mt-4 border-t border-vn-borda pt-4">
                <Rotulo className="mb-2">Dados pessoais mascarados antes da análise</Rotulo>
                <ul className="flex flex-wrap gap-2">
                  {result.redactions.map((r) => (
                    <Marcador key={`${r.type}-${r.marker}`} tom="neutro">
                      <span className="num">
                        {r.marker} × {r.count}
                      </span>
                    </Marcador>
                  ))}
                </ul>
              </div>
            )}

            <details className="mt-4 border-t border-vn-borda pt-4">
              <summary className="cursor-pointer text-rotulo text-vn-texto-suave">
                Ver prévia do texto sanitizado
              </summary>
              <pre className="mt-3 max-h-64 overflow-auto border border-vn-borda bg-vn-papel-50 p-4 text-legenda whitespace-pre-wrap text-vn-texto-suave">
                {result.sanitizedTextPreview}
              </pre>
            </details>
          </Cartao>

          <ReportView report={result.report} />
        </div>
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
 * A forma muda junto com a cor (quadrado cheio, contorno, ×): o rótulo ao lado nomeia a etapa, mas
 * não diz se ela terminou, e sem forma + texto acessível "concluída" e "pendente" seriam a mesma
 * marca em escala de cinza e no leitor de tela.
 */
function StatusMarca({ status }: { status: PipelineStepStatus }) {
  // EMPTY fica em neutro de propósito: "rodou e não achou nada" costuma ser a regra
  // anti-alucinação funcionando, não defeito — pintar de vermelho acusaria a aplicação de um erro
  // que não houve. Só FAILED é crítico, e ele existe justamente para não sobrar como pendente.
  const { classe, glifo, label } =
    status === "DONE"
      ? { classe: "bg-vn-acao text-white", glifo: "✓", label: "concluída" }
      : status === "FAILED"
        ? { classe: "bg-vn-critico text-white", glifo: "×", label: "falhou" }
        : status === "EMPTY"
          ? { classe: "border-2 border-vn-navy-400 bg-vn-navy-100 text-vn-navy-600", glifo: "–", label: "rodou sem resultado" }
          : { classe: "border-2 border-vn-papel-400 text-transparent", glifo: "·", label: "pendente" };

  return (
    <span
      role="img"
      aria-label={label}
      className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center text-[11px] font-extrabold ${classe}`}
    >
      <span aria-hidden="true">{glifo}</span>
    </span>
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
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
