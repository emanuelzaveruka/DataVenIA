#!/usr/bin/env node
/**
 * Acompanha uma execução do pipeline pelo terminal, consumindo o mesmo NDJSON que a interface
 * consome (`POST /api/documents`). Existe porque a orquestração vive em `lib/workflow/run-pipeline.ts`
 * e não na rota: o navegador e este script são só dois consumidores do mesmo fluxo de eventos.
 *
 *   node scripts/watch-run.mjs <arquivo> [--url http://localhost:3000] [--json] [--report] [--out runs]
 *
 * Requer `npm run dev` rodando e credencial de modelo configurada; a jurisprudência roda em fixture
 * sem configuração nenhuma.
 *
 * Com `--out`, grava uma pasta por execução com o que cada etapa produziu. Os artefatos só existem
 * se o **servidor** estiver com `PIPELINE_AUDIT` ligado (`artifacts` ou `full`) — este script não
 * consegue inventar o que o stream não trouxe, e avisa quando isso acontece.
 */
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { createRunDump } from "./run-dump.mjs";

const MIME_BY_EXTENSION = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".txt": "text/plain",
};

function parseArgs(argv) {
  const args = { url: "http://localhost:3000", json: false, report: false, out: undefined, path: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--url") args.url = argv[++i];
    else if (arg === "--json") args.json = true;
    else if (arg === "--report") args.report = true;
    // `--out` sem valor é o caso comum ("só quero os arquivos"), então tem default próprio.
    else if (arg === "--out") args.out = argv[i + 1]?.startsWith("-") === false ? argv[++i] : "runs";
    else if (!arg.startsWith("-") && !args.path) args.path = arg;
  }
  return args;
}

function formatDuration(ms) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

/**
 * Resumo de uma linha do output do nó. Texto longo fica de fora de propósito: no modo auditoria o
 * nó de parsing carrega o documento inteiro, e imprimi-lo apagaria o log da execução na rolagem.
 * Para ver o conteúdo existe `--out`.
 */
function summarize(value) {
  if (!value || typeof value !== "object") return "";
  return Object.entries(value)
    .filter(([, v]) => typeof v === "number" || typeof v === "boolean" || (typeof v === "string" && v.length <= 40))
    .slice(0, 3)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
}

/** Mesmo enquadramento de `lib/streaming/ndjson.ts`; duplicado aqui para o script não exigir build. */
async function* readNdjson(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      for (;;) {
        const newline = buffer.indexOf("\n");
        if (newline === -1) break;
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) yield JSON.parse(line);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) yield JSON.parse(buffer.trim());
  } finally {
    reader.releaseLock();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.path) {
    console.error("uso: node scripts/watch-run.mjs <arquivo.pdf|docx|txt> [--url <base>] [--json] [--report] [--out <dir>]");
    process.exitCode = 2;
    return;
  }

  const bytes = await readFile(args.path);
  const name = basename(args.path);
  const form = new FormData();
  form.append("file", new File([bytes], name, {
    type: MIME_BY_EXTENSION[extname(args.path).toLowerCase()] ?? "application/octet-stream",
  }));

  const controller = new AbortController();
  process.on("SIGINT", () => {
    console.log("\n⏹  cancelando execução…");
    controller.abort();
  });

  let response;
  try {
    response = await fetch(`${args.url}/api/documents`, {
      method: "POST",
      body: form,
      signal: controller.signal,
      // Sem isto a camada de compressão bufferiza os chunks e o streaming vira uma entrega só.
      headers: { "Accept-Encoding": "identity" },
    });
  } catch (cause) {
    if (cause?.name === "AbortError") return;
    console.error(`✖ não foi possível falar com ${args.url}: ${cause?.message ?? cause}`);
    console.error("  o servidor está rodando? tente 'npm run dev' em outro terminal.");
    process.exitCode = 1;
    return;
  }

  if (!response.headers.get("content-type")?.includes("ndjson")) {
    const body = await response.json().catch(() => null);
    console.error(`✖ HTTP ${response.status}: ${body?.error?.userMessage ?? body?.error?.description ?? "resposta inesperada"}`);
    process.exitCode = 1;
    return;
  }

  const startedAt = Date.now();
  const elapsed = () => `[+${((Date.now() - startedAt) / 1000).toFixed(1)}s]`;
  const dump = args.out ? createRunDump(args.out) : undefined;
  let sawArtifacts = false;

  for await (const event of readNdjson(response.body)) {
    await dump?.record(event);
    if (event.type === "stage" && event.event.nodeDetail?.subTasks?.length) sawArtifacts = true;

    if (args.json) {
      console.log(JSON.stringify(event));
      continue;
    }

    switch (event.type) {
      case "start":
        console.log(`⏱  run ${event.runId}  trace ${event.traceId}  ${name}`);
        break;
      case "stage": {
        const node = event.event.nodeDetail;
        const label = node?.nodeName ?? event.event.label;
        if (event.event.status === "RUNNING") {
          console.log(`${elapsed()} ⏳ ${label}`);
        } else if (event.event.status === "FAILED") {
          console.log(`${elapsed()} ✖  ${label}  (${formatDuration(event.event.durationMs)})  ${node?.error?.code ?? ""}`);
        } else {
          const extra = summarize(node?.output);
          console.log(`${elapsed()} ✅ ${label}  (${formatDuration(event.event.durationMs)})${extra ? `  ${extra}` : ""}`);
        }
        break;
      }
      case "result": {
        // `status`, não `done`: o campo booleano deixou de existir quando o progresso passou a
        // distinguir "rodou e não produziu nada" de "não cheguei aqui".
        const done = event.payload.progress.filter((step) => step.status === "DONE").length;
        console.log(`\n✔ relatório pronto · ${done}/${event.payload.progress.length} etapas · ${event.payload.provider.llm}/${event.payload.provider.model} · jurisprudência ${event.payload.provider.jurisprudence}`);
        if (args.report) console.log(JSON.stringify(event.payload.report, null, 2));
        break;
      }
      case "error":
        console.error(`\n✖ [${event.error.code}] ${event.error.userMessage ?? event.error.description}`);
        process.exitCode = 1;
        break;
      default:
        break;
    }
  }

  if (dump) {
    const dir = await dump.finish();
    console.log(`\n📁 artefatos em ${dir}  (comece pelo RESUMO.md)`);
    if (!sawArtifacts) {
      console.log("   ⚠  o servidor não emitiu artefatos por etapa — suba o dev com PIPELINE_AUDIT=artifacts (ou full).");
    }
  }
}

main().catch((cause) => {
  if (cause?.name === "AbortError") return;
  console.error(cause);
  process.exitCode = 1;
});
