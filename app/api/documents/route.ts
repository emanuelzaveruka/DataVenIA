import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getLlmProvider } from "../../../lib/llm/get-llm-provider";
import { getJurisprudenceProvider } from "../../../lib/providers/get-jurisprudence-provider";
import { getRepository } from "../../../lib/persistence/get-repository";
import { statusForError } from "../../../lib/errors/http-status";
import type { AppError } from "../../../lib/errors/app-error";
import {
  runPipeline,
  pipelineUnexpectedError,
  type PipelineEvent,
} from "../../../lib/workflow/run-pipeline";

export const runtime = "nodejs";

/** Teto de 20 e 120 caracteres: campo de termo, não caixa de texto livre para colar a peça. */
const TermsSchema = z.array(z.string().trim().min(1).max(120)).max(20);

function safeJsonParse(texto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch {
    return undefined;
  }
}

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
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: { code: "MISSING_FILE", userMessage: "Envie um arquivo no campo \"file\"." } },
      { status: 400 },
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  /**
   * Termos e recorte escolhidos na tela de envio. São opcionais: sem eles o pipeline roda
   * exatamente como antes, com as queries que o modelo gerar.
   *
   * Entrada externa é validada, não confiada — mas aqui um campo malformado vira 400 em vez de ser
   * ignorado em silêncio. Analisar a peça descartando o que o usuário digitou produziria um
   * relatório que parece certo e não cobriu o que ele pediu, que é pior do que recusar.
   */
  const termosBrutos = formData.get("terms");
  let extraTerms: string[] | undefined;

  if (typeof termosBrutos === "string" && termosBrutos.trim().length > 0) {
    const parsed = TermsSchema.safeParse(safeJsonParse(termosBrutos));
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_SEARCH_TERMS",
            userMessage: "Os termos de busca enviados não são válidos.",
          },
        },
        { status: 400 },
      );
    }
    extraTerms = parsed.data;
  }

  const judgingBody = formData.get("judgingBody");
  const periodStart = formData.get("periodStart");
  const filters =
    typeof judgingBody === "string" && judgingBody.length > 0
      ? { judgingBody, ...(typeof periodStart === "string" && periodStart ? { periodStart } : {}) }
      : typeof periodStart === "string" && periodStart.length > 0
        ? { periodStart }
        : undefined;

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
        for await (const event of runPipeline(
          {
            runId: randomUUID(),
            traceId: randomUUID(),
            file: { name: file.name, size: file.size, type: file.type, bytes },
            extraTerms,
            filters,
          },
          { repository, llmProvider, crossFileLlmProvider, jurisprudenceProvider, signal: controller.signal },
        )) {
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
