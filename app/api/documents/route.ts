import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getLlmProvider } from "../../../lib/llm/get-llm-provider";
import { getJurisprudenceProvider } from "../../../lib/providers/get-jurisprudence-provider";
import { getRepository } from "../../../lib/persistence/get-repository";
import { statusForError } from "../../../lib/errors/http-status";
import type { AppError } from "../../../lib/errors/app-error";
import {
  runPipeline,
  pipelineUnexpectedError,
  type PipelineEvent,
  type RunPipelineInput,
} from "../../../lib/workflow/run-pipeline";
import { SearchPlanSchema } from "../../../lib/schemas/search-plan.schema";

export const runtime = "nodejs";

function errorResponse(error: AppError) {
  return NextResponse.json({ error }, { status: statusForError(error) });
}

/**
 * A rota é só transporte: montar as dependências, abrir o stream e serializar os eventos que
 * `runPipeline` emite. Toda a orquestração mora em `lib/workflow/run-pipeline.ts`, que não conhece
 * HTTP — é o que permite o mesmo pipeline ser consumido pelo `scripts/watch-run.mjs` e pelos testes.
 *
 * O corpo sai como NDJSON (um JSON por linha) em vez de um `NextResponse.json` único: HU-04 e HU-35
 * pedem acompanhar a execução **em andamento**, e como o pipeline roda inteiro dentro desta
 * requisição, o próprio corpo da resposta é o canal de observação — sem estado compartilhado, sem
 * polling, e portanto sem depender de as requisições não serem isoladas.
 */
export async function POST(request: Request) {
  // Tudo que pode falhar ANTES do primeiro byte continua com status HTTP real. Depois que o stream
  // abre o 200 já foi para o cliente e o erro precisa viajar como dado (evento `error`).
  let repository;
  try {
    repository = getRepository();
  } catch (cause) {
    return errorResponse(pipelineUnexpectedError("getRepository", cause));
  }

  let llmProvider;
  let crossFileLlmProvider;
  try {
    llmProvider = getLlmProvider();
    crossFileLlmProvider = getLlmProvider(process.env, "crossFile");
  } catch (cause) {
    return errorResponse(pipelineUnexpectedError("getLlmProvider", cause));
  }

  const jurisprudenceProvider = getJurisprudenceProvider();

  const formData = await request.formData();
  const planoBruto = formData.get("plan");

  /**
   * Duas entradas na mesma rota, decididas pela presença de `plan`:
   *
   * - **envio** (`file`, com `mode=plan` para parar no checkpoint humano);
   * - **retomada** (`runId` + `plan`), que continua da busca com os termos que o usuário aprovou.
   *
   * O `plan` chega pela rede e é validado como qualquer entrada externa: `SearchPlanSchema` garante
   * a regra de HU-11 que a UI apenas explica — sem ao menos uma pesquisa CONTRARY, a busca sairia
   * de um lado só e o relatório ainda diria "nenhum precedente contrário na amostra", que passaria
   * a ser mentira sobre a busca em vez de fato sobre o acervo.
   */
  let pipelineInput: RunPipelineInput;

  if (typeof planoBruto === "string") {
    const runId = formData.get("runId");
    if (typeof runId !== "string" || runId.length === 0) {
      return NextResponse.json(
        {
          error: {
            code: "MISSING_RUN_ID",
            userMessage: "Para continuar uma análise é preciso informar qual execução retomar.",
          },
        },
        { status: 400 },
      );
    }

    let json: unknown;
    try {
      json = JSON.parse(planoBruto);
    } catch {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_SEARCH_PLAN",
            userMessage: "O plano de busca enviado não pôde ser lido.",
          },
        },
        { status: 400 },
      );
    }

    const plano = SearchPlanSchema.safeParse(json);
    if (!plano.success) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_SEARCH_PLAN",
            userMessage:
              plano.error.issues[0]?.message ?? "O plano de busca enviado não é válido.",
            description: plano.error.issues.map((issue) => issue.message).join(" "),
          },
        },
        { status: 422 },
      );
    }

    // O traceId da fase anterior volta pelo formulário para que as duas metades fiquem na mesma
    // linha do tempo auditável (HU-34/HU-35); sem ele, a retomada apareceria como execução órfã.
    const traceId = formData.get("traceId");
    pipelineInput = {
      runId,
      traceId: typeof traceId === "string" && traceId.length > 0 ? traceId : randomUUID(),
      resume: plano.data,
    };
  } else {
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: { code: "MISSING_FILE", userMessage: "Envie um arquivo no campo \"file\"." } },
        { status: 400 },
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    pipelineInput = {
      runId: randomUUID(),
      traceId: randomUUID(),
      file: { name: file.name, size: file.size, type: file.type, bytes },
      pauseAfterQueries: formData.get("mode") === "plan",
    };
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  if (request.signal.aborted) abort();
  else request.signal.addEventListener("abort", abort);

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    // `start` e não `pull`: o pipeline é drenado até o fim por esta função, não pelo ritmo do
    // consumidor. Se o navegador desconectar no meio, `enqueue` passa a falhar mas o generator
    // continua — é o que garante que `saveError`/`updateRun(FAILED)` ainda rodem e a execução não
    // fique pendurada num stage intermediário para sempre (HU-34).
    async start(streamController) {
      let clientGone = false;

      const write = (event: PipelineEvent) => {
        if (clientGone) return;
        try {
          streamController.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // O consumidor sumiu; `enqueue` lança em stream já fechado. Seguir drenando em silêncio.
          clientGone = true;
        }
      };

      try {
        for await (const event of runPipeline(pipelineInput, {
          repository,
          llmProvider,
          crossFileLlmProvider,
          jurisprudenceProvider,
          signal: controller.signal,
        })) {
          write(event);
        }
      } catch (cause) {
        const error = pipelineUnexpectedError("runPipeline", cause);
        write({ type: "error", httpStatus: statusForError(error), error });
      } finally {
        request.signal.removeEventListener("abort", abort);
        if (!clientGone) {
          try {
            streamController.close();
          } catch {
            // já fechado pelo cancel() — nada a fazer.
          }
        }
      }
    },

    // Navegador fechou a aba ou o usuário cancelou: abortar o trabalho de modelo em vez de seguir
    // gastando cota por um resultado que ninguém vai ler.
    cancel() {
      abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-store, no-transform",
      "X-Content-Type-Options": "nosniff",
      // Reverse proxies (nginx e afins) bufferizam a resposta por padrão, o que anularia o
      // streaming inteiro. Documentado em next/dist/docs/01-app/02-guides/streaming.md.
      "X-Accel-Buffering": "no",
    },
  });
}
