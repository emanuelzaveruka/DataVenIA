import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getLlmProvider } from "../../../lib/llm/get-llm-provider";
import { getJurisprudenceProvider } from "../../../lib/providers/get-jurisprudence-provider";
import { getRepository } from "../../../lib/persistence/get-repository";
import { getAuditLevel } from "../../../lib/config/audit";
import { getLogLevel } from "../../../lib/config/logging";
import { statusForError } from "../../../lib/errors/http-status";
import { MAX_USER_KEYWORDS } from "../../../lib/config/limits";
import type { AppError } from "../../../lib/errors/app-error";
import {
  runPipeline,
  pipelineUnexpectedError,
  type PipelineEvent,
} from "../../../lib/workflow/run-pipeline";

export const runtime = "nodejs";

/**
 * Teto de 120 caracteres: campo de palavra-chave, não caixa de texto livre para colar a peça.
 * `.min(1)` no array: desde que a LLM parou de gerar query nenhuma (2026-09-13), a busca inteira
 * depende do que o usuário escolheu aqui — vazio não é "roda sem recorte", é "não há o que buscar".
 */
const KeywordsSchema = z.array(z.string().trim().min(1).max(120)).min(1).max(MAX_USER_KEYWORDS);

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

  // Mesmo tratamento dos demais: `JURISPRUDENCE_PROVIDER` escrito errado é erro de configuração, e
  // vazar como 500 não tratado esconde a única informação útil — qual valor é inválido.
  let jurisprudenceProvider;
  try {
    jurisprudenceProvider = getJurisprudenceProvider();
  } catch (cause) {
    return errorResponse(pipelineUnexpectedError("getJurisprudenceProvider", cause));
  }

  // Também antes do primeiro byte: `PIPELINE_AUDIT` mal escrito é erro de configuração, e descobrir
  // isso no fim de uma execução inteira seria pior do que recusar agora.
  let auditLevel;
  try {
    auditLevel = getAuditLevel();
  } catch (cause) {
    return errorResponse(pipelineUnexpectedError("getAuditLevel", cause));
  }

  // Mesma regra, outro canal: `PIPELINE_LOG` mal escrito é erro de configuração, e um log que não
  // aparece é justamente o que a pessoa não tem como perceber sozinha.
  let logLevel;
  try {
    logLevel = getLogLevel();
  } catch (cause) {
    return errorResponse(pipelineUnexpectedError("getLogLevel", cause));
  }

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
   * Palavras-chave e recorte escolhidos na tela de envio. Desde 2026-09-13 as palavras-chave não
   * são mais opcionais: não há LLM gerando query nenhuma, então sem elas o pipeline não tem o que
   * buscar. Recusa com 400 em vez de deixar `runPipeline` falhar no meio do stream — é o mesmo
   * princípio de sempre: entrada externa malformada vira erro explícito, nunca é ignorada em
   * silêncio.
   */
  const termosBrutos = formData.get("terms");
  if (typeof termosBrutos !== "string" || termosBrutos.trim().length === 0) {
    return NextResponse.json(
      {
        error: {
          code: "MISSING_SEARCH_KEYWORDS",
          userMessage: "Selecione ao menos uma palavra-chave de busca antes de analisar.",
        },
      },
      { status: 400 },
    );
  }

  const parsedKeywords = KeywordsSchema.safeParse(safeJsonParse(termosBrutos));
  if (!parsedKeywords.success) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_SEARCH_KEYWORDS",
          userMessage: `Selecione entre 1 e ${MAX_USER_KEYWORDS} palavras-chave de busca válidas.`,
        },
      },
      { status: 400 },
    );
  }
  const keywords = parsedKeywords.data;

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
            keywords,
            filters,
          },
          {
            repository,
            llmProvider,
            crossFileLlmProvider,
            jurisprudenceProvider,
            signal: controller.signal,
            auditLevel,
            logLevel,
          },
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
