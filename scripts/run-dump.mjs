/**
 * Escreve numa pasta o que cada etapa do pipeline produziu, a partir dos eventos NDJSON de
 * `POST /api/documents` com `PIPELINE_AUDIT` ligado.
 *
 * Existe como módulo separado de `watch-run.mjs` porque são duas responsabilidades diferentes:
 * aquele mostra a execução acontecendo, este a deixa conferível depois — inclusive comparando duas
 * execuções com `diff -r`, que é o motivo de cada artefato ser um arquivo e não uma seção de um
 * JSON gigante.
 *
 * Nada aqui interpreta o conteúdo: os artefatos saem como o pipeline os emitiu. O `RESUMO.md` é a
 * única peça editorial, e só diz onde olhar e o que conferir à mão.
 */
import { mkdir, writeFile, appendFile } from "node:fs/promises";
import { join } from "node:path";

const NODE_FILES = {
  "node-05-document-analysis": ["05-case-analysis.json", (o) => o.caseAnalysis],
  "node-06-query-generation": ["06-queries.json", (o) => o.queries],
  "node-09-cross-file-analysis": ["09-cross-file.json", (o) => o.analyses],
  "node-10-evidence-verification": ["10-evidencias.json", (o) => o],
  "node-11-report-generation": ["11-relatorio.json", (o) => o.report],
};

function slug(value, max = 48) {
  return String(value)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, max) || "sem-nome";
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function formatDuration(ms) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

/**
 * O diff de redação em texto: o que havia e o que ficou, ocorrência a ocorrência. `original` só
 * existe quando o servidor rodou em `PIPELINE_AUDIT=full`; sem ele, o arquivo ainda vale por
 * mostrar onde cada marcador entrou.
 */
function redactionDiff(spans) {
  const lines = [
    "# Diff de redação (HU-05)",
    "",
    "Uma linha por ocorrência mascarada. `contexto` mostra a frase ao redor já sanitizada.",
    "Nome de parte fora de bloco de qualificação (`Nome, brasileiro, ..., CPF`) não é detectado —",
    "é exatamente isso que este arquivo serve para medir num documento real.",
    "",
  ];

  for (const [index, span] of spans.entries()) {
    lines.push(`## ${pad(index + 1)} · ${span.type} → ${span.marker}`);
    if (span.original !== undefined) lines.push(`- antes:  ${span.original}`);
    lines.push(`- depois: ${span.marker}`);
    lines.push(`- posição (na passada): ${span.start} (+${span.length})`);
    lines.push(`- contexto: ${span.context}`);
    lines.push("");
  }

  return lines.join("\n");
}

export function createRunDump(baseDir) {
  /** @type {Map<string, object>} */
  const nodes = new Map();
  let runId;
  let traceId;
  let dir;
  let result;
  let failure;

  async function ensureDir() {
    if (!dir) {
      dir = join(baseDir, runId ?? `run-${Date.now()}`);
      await mkdir(dir, { recursive: true });
    }
    return dir;
  }

  return {
    get dir() {
      return dir;
    },

    /** Grava o evento cru antes de qualquer interpretação: execução interrompida ainda deixa log. */
    async record(event) {
      if (event.type === "start") {
        runId = event.runId;
        traceId = event.traceId;
      }
      const target = await ensureDir();
      await appendFile(join(target, "00-eventos.ndjson"), `${JSON.stringify(event)}\n`);

      if (event.type === "stage" && event.event.status !== "RUNNING" && event.event.nodeDetail) {
        nodes.set(event.event.nodeDetail.id, event.event.nodeDetail);
      }
      if (event.type === "result") result = event.payload;
      if (event.type === "error") failure = event.error;
    },

    /** Só no fim: os artefatos derivam dos nós terminais, que só existem quando a etapa fecha. */
    async finish() {
      const target = await ensureDir();
      const written = [];

      const write = async (relative, contents) => {
        const full = join(target, relative);
        await mkdir(join(full, ".."), { recursive: true });
        await writeFile(full, contents);
        written.push(relative);
      };

      // 03 · texto extraído, página a página
      const parsing = nodes.get("node-03-parsing");
      if (parsing?.output?.pages?.length) {
        for (const page of parsing.output.pages) {
          if (typeof page.text === "string") {
            await write(join("03-texto-extraido", `pagina-${pad(page.page)}.txt`), page.text);
          }
        }
        await write(
          "03-parsing.json",
          json({
            metadata: parsing.output.metadata,
            charCount: parsing.output.charCount,
            pages: parsing.output.pages.map(({ page, charCount }) => ({ page, charCount })),
          }),
        );
      }

      // 04 · sanitização
      const sanitizing = nodes.get("node-04-sanitizing");
      if (sanitizing?.output) {
        await write(
          "04-sanitizacao.json",
          json({
            redactions: sanitizing.output.redactions,
            spans: sanitizing.output.spans,
          }),
        );
        if (sanitizing.output.spans?.length) {
          await write("04-sanitizacao.diff.txt", redactionDiff(sanitizing.output.spans));
        }
        if (typeof sanitizing.output.sanitizedText === "string") {
          await write("04-texto-sanitizado.txt", sanitizing.output.sanitizedText);
        }
      }

      // 05, 06, 09, 10, 11 · artefato único por etapa
      for (const [nodeId, [file, pick]] of Object.entries(NODE_FILES)) {
        const node = nodes.get(nodeId);
        const value = node?.output ? pick(node.output) : undefined;
        if (value !== undefined) await write(file, json(value));
      }

      // 07 · uma busca por arquivo, mais o ranking
      const search = nodes.get("node-07-search");
      for (const [index, task] of (search?.subTasks ?? []).entries()) {
        await write(
          join("07-busca", `${pad(index + 1)}-${slug(task.name)}.json`),
          json({ status: task.status, input: task.input, output: task.output, error: task.error }),
        );
      }
      if (search?.output?.ranked) {
        await write("07-ranking.json", json(search.output.ranked));
      }

      // 08 · um Scratchpad por arquivo
      for (const task of nodes.get("node-08-scratchpad-generation")?.subTasks ?? []) {
        await write(
          join("08-scratchpads", `${slug(task.id)}.json`),
          json(task.output ?? { status: task.status, input: task.input, error: task.error }),
        );
      }

      // prompts · uma chamada de modelo por arquivo, na ordem em que saíram
      let promptIndex = 0;
      for (const node of nodes.values()) {
        for (const task of node.subTasks ?? []) {
          if (typeof task.input?.system !== "string") continue;
          promptIndex += 1;
          const body = [
            `# ${node.nodeName}`,
            "",
            `- provider: ${task.input.provider}`,
            `- modelo declarado: ${task.input.model}`,
            `- respondeu de fato: ${task.input.respondedBy ?? task.input.model}`,
            `- duração: ${formatDuration(task.durationMs ?? 0)}`,
            `- resultado: ${task.status}`,
            task.error ? `- erro: ${task.error.code} — ${task.error.description ?? ""}` : "",
            "",
            "## system",
            "",
            "```",
            task.input.system,
            "```",
            "",
            "## prompt",
            "",
            "```",
            task.input.prompt,
            "```",
            "",
            "## saída",
            "",
            "```json",
            JSON.stringify(task.output ?? null, null, 2),
            "```",
            "",
          ]
            .filter((line) => line !== "")
            .join("\n");
          await write(join("prompts", `${pad(promptIndex)}-${slug(node.stage)}.md`), `${body}\n`);
        }
      }

      await write("RESUMO.md", buildSummary({ runId, traceId, nodes, result, failure, written }));
      return target;
    },
  };
}

/** O índice da pasta: o que cada etapa produziu e o que dá para conferir na mão em cada uma. */
function buildSummary({ runId, traceId, nodes, result, failure, written }) {
  const checks = {
    // Só PDF tem páginas; num TXT ou DOCX a pasta não existe e apontar para ela seria mentira.
    "node-03-parsing": written.some((file) => file.startsWith("03-texto-extraido"))
      ? "Abra `03-texto-extraido/` e confira se nenhuma página está vazia — página vazia no meio é PDF escaneado sem OCR."
      : "Compare `charCount` em `00-eventos.ndjson` com o tamanho do documento: texto faltando aqui falta em todas as etapas seguintes.",
    "node-04-sanitizing":
      "Leia `04-sanitizacao.diff.txt` e procure dado pessoal que sobrou em `04-texto-sanitizado.txt` (é este arquivo que vai ao modelo).",
    "node-05-document-analysis":
      "Compare `05-case-analysis.json` com o documento: fato ou pedido que não está no texto é invenção.",
    "node-06-query-generation":
      "Em `06-queries.json`, confira que existe ao menos uma query com intent CONTRARY e que todo legalIssueId existe na etapa 05.",
    "node-07-search":
      "Abra a `url` de cada arquivo de `07-busca/` no navegador e compare `totalCount` e os acórdãos listados com o portal. `07-ranking.json` mostra por que cada um entrou ou ficou de fora.",
    "node-08-scratchpad-generation":
      "Em `08-scratchpads/`, confira que cada holding tem stance próprio (HU-18) e que nenhuma citação de `evidenceCandidates` foi inventada.",
    "node-09-cross-file-analysis":
      "Em `09-cross-file.json`, todo scratchpadId e evidenceId deve existir nas etapas 08; toda questão jurídica aparece uma vez só.",
    "node-10-evidence-verification":
      "Em `10-evidencias.json`, procure `verified: false`: `NOT_FOUND` é citação que não está na fonte, `SOURCE_CHANGED` é decisão alterada no portal desde a coleta.",
    "node-11-report-generation":
      "Em `11-relatorio.json`, `omissions` e `policyDropped` explicam o que foi removido e por quê.",
  };

  const rows = [...nodes.values()].map((node) => {
    const count = Object.entries(node.output ?? {})
      .filter(([, value]) => typeof value === "number")
      .map(([key, value]) => `${key}=${value}`)
      .join(" ");
    return `| ${node.nodeName} | ${node.status} | ${formatDuration(node.durationMs ?? 0)} | ${count || "—"} |`;
  });

  const checklist = [...nodes.values()]
    .filter((node) => checks[node.id])
    .map((node) => `### ${node.nodeName}\n\n${checks[node.id]}\n`);

  return [
    `# Execução ${runId ?? "(sem runId)"}`,
    "",
    `- traceId: \`${traceId ?? "—"}\``,
    result
      ? `- modelo: ${result.provider.llm}/${result.provider.model}${result.provider.crossFileModel ? ` (cross-file: ${result.provider.crossFileModel})` : ""}`
      : "",
    result ? `- jurisprudência: ${result.provider.jurisprudence}` : "",
    failure ? `- **terminou em erro**: \`${failure.code}\` — ${failure.userMessage ?? failure.description}` : "",
    "",
    "Nenhum arquivo desta pasta é gerado por modelo: são os artefatos que o pipeline emitiu.",
    "Explicação de cada etapa: `public/como-funciona.html` (servido em `/como-funciona.html`).",
    "",
    "## Etapas",
    "",
    "| Nó | Status | Duração | Contagens |",
    "|---|---|---|---|",
    ...rows,
    "",
    "## O que conferir à mão",
    "",
    ...checklist,
    "## Arquivos",
    "",
    ...written.sort().map((file) => `- \`${file}\``),
    "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}
