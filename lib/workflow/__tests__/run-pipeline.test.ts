import { describe, expect, it, vi } from "vitest";
import { runPipeline, type PipelineEvent } from "../run-pipeline";
import { createInMemoryRepository } from "../../persistence/in-memory-repository";
import { createFixtureProvider } from "../../providers/fixture";
import type { LogLevel } from "../../config/logging";
import { FIXTURE_RAW_DECISIONS } from "../../providers/fixtures/tjpr-demo-case";
import { parseStructuredOutput } from "../../llm/validate-structured-output";
import { toolFailure } from "../../errors/tool-result";
import { createAppError } from "../../errors/app-error";
import type { GenerateStructuredParams, LlmProvider } from "../../llm/provider";
import type { DataVeniaRepository } from "../../persistence/repository";
import type { JurisprudenceProvider } from "../../providers/jurisprudence-provider";
import type { JurisprudenceQuery } from "../../schemas/search.schema";
import type { AuditLevel } from "../../config/audit";
import { MAX_USER_KEYWORDS } from "../../config/limits";

const CASE_ANALYSIS = {
  processNumber: "0009876-54.2025.8.16.0001",
  court: "TJPR",
  chamber: "9ª Câmara Cível",
  parties: { plaintiff: "[PARTE_1]", defendant: "[PARTE_2] Saúde S.A." },
  facts: ["Beneficiária teve negada a cobertura de procedimento cirúrgico prescrito."],
  requests: ["Cobertura integral do procedimento prescrito"],
  legalIssues: [
    {
      id: "LI-1",
      topic: "Abusividade da negativa de cobertura",
      question: "A negativa de cobertura baseada em exclusão genérica é abusiva?",
      relevance: "HIGH",
    },
  ],
  clientArguments: ["A prescrição do médico assistente prevalece sobre a exclusão contratual."],
  opposingArguments: ["O procedimento está excluído do contrato."],
  citedLaws: ["Lei 9.656/1998"],
  citedPrecedents: ["Súmula 608 do STJ"],
  evidenceSummary: ["Relatório médico"],
};

/** Keywords padrão dos testes que não estão exercitando a escolha de keywords em si. */
const DEFAULT_KEYWORDS = ["plano saude"];

/** Frase real do acórdão da fixture: é o que faz a verificação de citação (HU-24) confirmar. */
function longestSentence(fullText: string): string {
  return fullText
    .split(/(?<=\.)\s+/)
    .map((sentence) => sentence.trim())
    .reduce((longest, sentence) => (sentence.length > longest.length ? sentence : longest), "");
}

function scratchpadContentFor(decisionId: string) {
  const decision = FIXTURE_RAW_DECISIONS.find((item) => item.id === decisionId);
  if (!decision) throw new Error(`fixture sem decisão ${decisionId}`);

  return {
    relevance: { score: 0.8, reason: "Mesma controvérsia de cobertura em plano de saúde." },
    caseSummary: decision.summary ?? "Resumo da decisão.",
    facts: [],
    legalIssues: ["Abusividade da negativa de cobertura"],
    holdings: [
      {
        proposition: "Abusividade da negativa de cobertura do tratamento prescrito",
        stance: "SUPPORTS",
        reasoning: decision.summary ?? "Fundamentação da decisão.",
      },
    ],
    favorablePoints: [decision.summary ?? "Ponto favorável."],
    contraryPoints: [],
    distinguishingFacts: [],
    citedLaws: ["Lei 9.656/1998"],
    citedPrecedents: [],
    evidenceCandidates: [
      {
        id: `EV-${decisionId}`,
        quote: longestSentence(decision.fullText ?? ""),
        context: "Trecho da ementa do acórdão.",
        purpose: "Sustenta a abusividade da negativa de cobertura.",
      },
    ],
    confidence: 0.85,
    status: "VALID",
  };
}

/**
 * O schema do cross-file é fechado sobre os IDs reais daquela execução, e `scratchpadId` é um
 * uuid gerado em tempo de execução. Então o stub lê do próprio prompt quais IDs existem — a mesma
 * técnica que `generate-scratchpads.test.ts` usa para o id da decisão.
 */
function crossFileFromPrompt(prompt: string) {
  const scratchpadIds = [...prompt.matchAll(/- scratchpadId: (\S+)/g)].map((m) => m[1]!);
  const evidenceIds = [...prompt.matchAll(/ {4}- (EV-\S+): /g)].map((m) => m[1]!);

  const analysis = {
    legalIssueId: "LI-1",
    conclusion: "As Câmaras analisadas reconhecem a abusividade da negativa de cobertura.",
    supportingDecisions: scratchpadIds,
    opposingDecisions: [],
    mixedDecisions: [],
    chamberPattern: "A 9ª Câmara Cível tende a reconhecer a abusividade.",
    recurringFactors: ["Generalidade da cláusula de exclusão"],
    strongestSupporting: scratchpadIds.slice(0, 2),
    strongestOpposing: [],
    risks: [
      {
        description: "Exclusão contratual específica pode sustentar a negativa.",
        evidenceIds: [evidenceIds[0]!],
      },
    ],
    suggestedArguments: [
      {
        argument: "Sustentar que a exclusão genérica não prevalece sobre a prescrição médica.",
        evidenceIds: [evidenceIds[0]!],
      },
    ],
  };

  return { analyses: [analysis] };
}

interface StubOptions {
  failOn?: string;
  scratchpadStatus?: "VALID" | "PARTIAL";
  auditLevel?: AuditLevel;
  logLevel?: LogLevel;
}

function stubLlmProvider(options: StubOptions = {}): LlmProvider {
  return {
    name: "stub",
    model: "stub-model",
    async generateStructured<T>(params: GenerateStructuredParams<T>) {
      if (options.failOn === params.schemaName) {
        return toolFailure(
          createAppError({
            code: "LLM_UNAVAILABLE",
            category: "UPSTREAM",
            severity: "ERROR",
            description: `stub configurado para falhar em ${params.schemaName}`,
            userMessage: "O modelo está indisponível.",
            isRetryable: false,
            operation: params.schemaName,
          }),
        );
      }

      switch (params.schemaName) {
        case "CaseAnalysis":
          return parseStructuredOutput(params.schema, params.schemaName, CASE_ANALYSIS, "stub");
        case "DecisionScratchpadContent": {
          const id = /ID interno da decisão: (\S+)/.exec(params.prompt)?.[1];
          const content = {
            ...scratchpadContentFor(id!),
            status: options.scratchpadStatus ?? "VALID",
          };
          return parseStructuredOutput(params.schema, params.schemaName, content, "stub");
        }
        case "CrossFileAnalysis":
          return parseStructuredOutput(
            params.schema,
            params.schemaName,
            crossFileFromPrompt(params.prompt),
            "stub",
          );
        default:
          throw new Error(`stub sem resposta para ${params.schemaName}`);
      }
    },
  } as LlmProvider;
}

// Com dado pessoal de propósito: é o que permite verificar que a sanitização roda de fato antes da
// primeira chamada de modelo (HU-05) e que o modo auditoria consegue mostrar o que ela mascarou.
const PETITION = `EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DE DIREITO

Maria Aparecida Souza, brasileira, inscrita no CPF nº 123.456.789-01, residente e domiciliada
na Rua das Acácias, nº 120, requerente nesta ação.

A autora firmou contrato de plano de saúde e teve negada a cobertura de procedimento
cirúrgico prescrito pelo médico assistente, sob alegação de exclusão contratual genérica.
Requer a cobertura integral do procedimento e indenização por danos morais.
`;

async function collectEvents(
  options: StubOptions = {},
  repository: DataVeniaRepository = createInMemoryRepository(),
): Promise<{ events: PipelineEvent[]; repository: DataVeniaRepository; runId: string }> {
  const runId = "run-test-0001";
  const events: PipelineEvent[] = [];

  for await (const event of runPipeline(
    {
      runId,
      traceId: "trace-test-0001",
      file: {
        name: "peticao.txt",
        size: Buffer.byteLength(PETITION),
        type: "text/plain",
        bytes: Buffer.from(PETITION, "utf-8"),
      },
      keywords: DEFAULT_KEYWORDS,
    },
    {
      repository,
      llmProvider: stubLlmProvider(options),
      jurisprudenceProvider: createFixtureProvider(),
      auditLevel: options.auditLevel,
      logLevel: options.logLevel,
    },
  )) {
    events.push(event);
  }

  return { events, repository, runId };
}

function stageEvents(events: PipelineEvent[]) {
  return events.filter((event) => event.type === "stage") as Extract<
    PipelineEvent,
    { type: "stage" }
  >[];
}

describe("runPipeline", () => {
  it("emite RUNNING antes do estado terminal de cada nó, com o mesmo id", async () => {
    const { events } = await collectEvents();

    const stages = stageEvents(events);
    const running = stages.filter((event) => event.event.status === "RUNNING");
    expect(running.length).toBeGreaterThan(0);

    for (const start of running) {
      const id = start.event.nodeDetail!.id;
      const startIndex = stages.indexOf(start);
      // O último evento do nó, não o próximo: uma etapa longa emite várias atualizações RUNNING
      // com o mesmo id (o progresso decisão a decisão da geração de Scratchpads). O que a regra
      // exige é que o nó termine, e que o estado terminal venha depois do RUNNING.
      const terminal = stages.findLastIndex((event) => event.event.nodeDetail?.id === id);

      expect(terminal, `nó ${id} sem evento terminal`).toBeGreaterThan(startIndex);
      expect(stages[terminal]!.event.status).not.toBe("RUNNING");
    }
  });

  it("nunca emite um estado terminal sem RUNNING anterior para o mesmo nó", async () => {
    const { events } = await collectEvents();
    const stages = stageEvents(events);
    const seenRunning = new Set<string>();

    for (const event of stages) {
      const id = event.event.nodeDetail!.id;
      if (event.event.status === "RUNNING") {
        seenRunning.add(id);
        continue;
      }
      // O nó de upload é instantâneo e registrado direto como concluído, por não ter trabalho a
      // acompanhar; todos os demais precisam ter aberto com RUNNING.
      if (id === "node-01-received") continue;
      expect(seenRunning.has(id), `nó ${id} terminou sem ter começado`).toBe(true);
    }
  });

  it("relata a geração de Scratchpads decisão a decisão, e não só quando a etapa acaba", async () => {
    const { events } = await collectEvents();

    const atualizacoes = stageEvents(events).filter(
      (event) =>
        event.event.nodeDetail?.id === "node-08-scratchpad-generation" &&
        event.event.status === "RUNNING" &&
        event.event.nodeDetail?.output !== undefined,
    );

    // A etapa MAP é a mais longa do pipeline (uma chamada de modelo por decisão). Sem estas
    // atualizações, o stream fica mudo por minutos e "lento" e "travado" ficam idênticos.
    expect(atualizacoes.length).toBeGreaterThan(0);

    const contagens = atualizacoes.map((event) => {
      const output = event.event.nodeDetail!.output as { processed: number; failed: number; total: number };
      return output.processed + output.failed;
    });

    expect([...contagens].sort((a, b) => a - b)).toEqual(contagens);
    const ultima = atualizacoes.at(-1)!.event.nodeDetail!.output as { processed: number; total: number };
    expect(ultima.processed).toBe(ultima.total);
    // Duração real do nó, e não zero a cada atualização: é o que deixa "está demorando" mensurável.
    expect(atualizacoes.at(-1)!.event.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("escreve no terminal do servidor só quando PIPELINE_LOG pede", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      await collectEvents();
      expect(log, "sem logLevel o pipeline não escreve nada no console").not.toHaveBeenCalled();

      await collectEvents({ logLevel: "stages" });
      const linhas = log.mock.calls.map((call) => String(call[0]));
      expect(linhas.some((linha) => linha.includes("08. Extraction Scratchpads"))).toBe(true);
      expect(linhas.every((linha) => linha.startsWith("[run run-test]"))).toBe(true);
    } finally {
      log.mockRestore();
    }
  });

  it("chega ao relatório final e o payload não vaza nós RUNNING", async () => {
    const { events } = await collectEvents();

    const last = events.at(-1);
    expect(last?.type).toBe("result");

    const payload = (last as Extract<PipelineEvent, { type: "result" }>).payload;
    // Regressão de contrato: `stages` sempre foi o log terminal da execução. Um RUNNING aqui
    // seria um nó que nunca terminou.
    expect(payload.stages.some((event) => event.status === "RUNNING")).toBe(false);
    expect(payload.report.reportId).toBeTruthy();
    expect(payload.provider.llm).toBe("stub");
  });

  it("emite progresso acumulado ao longo da execução, não só no fim", async () => {
    const { events } = await collectEvents();
    const progress = events.filter((event) => event.type === "progress");

    expect(progress.length).toBeGreaterThan(3);

    const doneCounts = progress.map(
      (event) =>
        (event as Extract<PipelineEvent, { type: "progress" }>).steps.filter(
          (step) => step.status === "DONE",
        ).length,
    );
    // Monotônico: uma etapa concluída nunca "desconclui".
    expect([...doneCounts].sort((a, b) => a - b)).toEqual(doneCounts);
    expect(doneCounts.at(-1)).toBeGreaterThan(doneCounts[0]!);
  });

  it("marca o nó como FAILED, encerra com erro e persiste a falha", async () => {
    const { events, repository, runId } = await collectEvents({ failOn: "CaseAnalysis" });

    const last = events.at(-1);
    expect(last?.type).toBe("error");
    expect((last as Extract<PipelineEvent, { type: "error" }>).error.code).toBe("LLM_UNAVAILABLE");

    const stages = stageEvents(events);
    const failed = stages.filter((event) => event.event.status === "FAILED");
    expect(failed).toHaveLength(1);
    expect(failed[0]!.event.stage).toBe("DOCUMENT_ANALYSIS");

    // Nenhuma etapa posterior foi tentada.
    const failedIndex = stages.indexOf(failed[0]!);
    expect(stages.slice(failedIndex + 1)).toHaveLength(0);

    // A persistência acontece mesmo com o resultado saindo como evento de stream (HU-34).
    const snapshot = await repository.loadRun(runId);
    expect(snapshot.isError).toBe(false);
    if (snapshot.isError) return;
    expect(snapshot.data?.run.status).toBe("FAILED");
    expect(snapshot.data?.run.finishedAt).toBeTruthy();
    expect(snapshot.data?.errors).toHaveLength(1);
    expect(snapshot.data?.errors[0]?.code).toBe("LLM_UNAVAILABLE");
  });

  it("bloqueia o avanço quando não há scratchpads válidos suficientes (HU-19)", async () => {
    const { events } = await collectEvents({ scratchpadStatus: "PARTIAL" });

    const last = events.at(-1);
    expect(last?.type).toBe("error");
    expect((last as Extract<PipelineEvent, { type: "error" }>).error.code).toBe(
      "INSUFFICIENT_VALID_SCRATCHPADS",
    );
  });

  it("registra um ToolExecutionLog por tool com traceId e workflowId consistentes (HU-35)", async () => {
    const { repository, runId } = await collectEvents();

    const snapshot = await repository.loadRun(runId);
    expect(snapshot.isError).toBe(false);
    if (snapshot.isError) return;

    const logs = snapshot.data!.toolExecutions;
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.every((log) => log.workflowId === runId)).toBe(true);
    expect(logs.every((log) => log.traceId === "trace-test-0001")).toBe(true);
    expect(logs.map((log) => log.toolName)).toContain("analyzeCase");
    expect(logs.map((log) => log.toolName)).toContain("buildReport");
  });
  it("sem modo auditoria, cada nó emite só a contagem que sempre emitiu", async () => {
    const { events } = await collectEvents();
    const byId = new Map(
      stageEvents(events)
        .filter((event) => event.event.status !== "RUNNING")
        .map((event) => [event.event.nodeDetail!.id, event.event.nodeDetail!]),
    );

    // O artefato nunca sai por engano: o default tem de ser indistinguível do comportamento antigo.
    expect(Object.keys(byId.get("node-05-document-analysis")!.output as object)).toEqual([
      "legalIssuesCount",
      "factsCount",
    ]);
    expect(byId.get("node-04-sanitizing")!.output).not.toHaveProperty("sanitizedText");
    expect(byId.get("node-09-cross-file-analysis")!.output).not.toHaveProperty("analyses");
    expect(byId.get("node-11-report-generation")!.output).not.toHaveProperty("report");

    // Sub-tarefas são material de auditoria: fora dela, nenhum nó as carrega.
    expect([...byId.values()].every((node) => node.subTasks === undefined)).toBe(true);
  });

  it("em modo auditoria, cada nó carrega o artefato que produziu", async () => {
    const { events } = await collectEvents({ auditLevel: "artifacts" });
    const byId = new Map(
      stageEvents(events)
        .filter((event) => event.event.status !== "RUNNING")
        .map((event) => [event.event.nodeDetail!.id, event.event.nodeDetail!]),
    );

    const caseOutput = byId.get("node-05-document-analysis")!.output as Record<string, unknown>;
    expect(caseOutput.legalIssuesCount).toBe(1);
    expect(caseOutput.caseAnalysis).toMatchObject({ court: "TJPR" });

    expect((byId.get("node-04-sanitizing")!.output as Record<string, unknown>).sanitizedText).toBeDefined();
    expect((byId.get("node-09-cross-file-analysis")!.output as Record<string, unknown>).analyses).toBeDefined();
    expect((byId.get("node-10-evidence-verification")!.output as Record<string, unknown>).evidences).toBeDefined();
    expect((byId.get("node-11-report-generation")!.output as Record<string, unknown>).report).toBeDefined();
  });

  it("em modo auditoria, busca, scratchpads e evidências viram sub-tarefas conferíveis", async () => {
    const { events } = await collectEvents({ auditLevel: "artifacts" });
    const byId = new Map(
      stageEvents(events)
        .filter((event) => event.event.status !== "RUNNING")
        .map((event) => [event.event.nodeDetail!.id, event.event.nodeDetail!]),
    );

    // Uma sub-tarefa só, com o total que a fonte declarou: é o que se compara com o portal.
    const search = byId.get("node-07-search")!.subTasks!;
    expect(search).toHaveLength(1);
    expect(search[0]!.output).toHaveProperty("totalCount");

    const scratchpads = byId.get("node-08-scratchpad-generation")!.subTasks!;
    expect(scratchpads.length).toBeGreaterThanOrEqual(3);

    // Cada citação sai com o veredito ao lado — sem isso "N verificadas" não é conferível.
    const evidences = byId.get("node-10-evidence-verification")!.subTasks!;
    expect(evidences.length).toBeGreaterThan(0);
    expect((evidences[0]!.output as Array<Record<string, unknown>>)[0]).toHaveProperty("matchKind");
  });

  it("em modo auditoria, as chamadas de modelo saem com system, prompt e modelo", async () => {
    const { events } = await collectEvents({ auditLevel: "artifacts" });
    const byId = new Map(
      stageEvents(events)
        .filter((event) => event.event.status !== "RUNNING")
        .map((event) => [event.event.nodeDetail!.id, event.event.nodeDetail!]),
    );

    const call = byId.get("node-05-document-analysis")!.subTasks![0]!;
    const input = call.input as Record<string, unknown>;
    expect(input.model).toBe("stub-model");
    expect(String(input.system)).toContain("assistente jurídico");
    expect(String(input.prompt)).toContain("<documento>");

    // Query Builder não chama modelo nenhum desde 2026-09-13 (a busca vem das keywords que o
    // usuário escolheu) — o nó não carrega chamada de LLM alguma.
    expect(byId.get("node-06-query-generation")!.subTasks).toBeUndefined();
  });

  it("o texto anterior à sanitização só sai no nível full", async () => {
    const parcial = await collectEvents({ auditLevel: "artifacts" });
    const completo = await collectEvents({ auditLevel: "full" });

    const parsingOf = (events: PipelineEvent[]) =>
      stageEvents(events).find(
        (event) =>
          event.event.nodeDetail?.id === "node-03-parsing" && event.event.status !== "RUNNING",
      )!.event.nodeDetail!.output as Record<string, unknown>;

    expect(parsingOf(parcial.events).rawText).toBeUndefined();
    expect(parsingOf(completo.events).rawText).toContain("EXCELENTÍSSIMO");
  });

  it("etapa que falha ainda entrega o prompt que produziu a saída recusada", async () => {
    const { events } = await collectEvents({ auditLevel: "artifacts", failOn: "CrossFileAnalysis" });

    const failed = stageEvents(events).find((event) => event.event.status === "FAILED")!;
    expect(failed.event.nodeDetail!.id).toBe("node-09-cross-file-analysis");

    // É o momento em que ver o prompt vale mais: sem isto, "saída estruturada inválida" chega sem
    // o que foi pedido ao modelo.
    const calls = failed.event.nodeDetail!.subTasks!;
    expect(calls.length).toBeGreaterThan(0);
    expect(String((calls[0]!.input as Record<string, unknown>).prompt)).toContain("<scratchpads>");
    expect(calls.every((call) => call.status === "FAILED")).toBe(true);
  });
});

/**
 * Keywords e recorte escolhidos pelo usuário na tela de envio.
 *
 * Decisão de 2026-09-13: não há mais LLM gerando query — o usuário escolhe até
 * `MAX_USER_KEYWORDS` palavras-chave (sugeridas a partir da peça ou digitadas) e elas viram,
 * sozinhas, a ÚNICA busca feita no TJPR. O que está sendo protegido aqui: exatamente uma chamada
 * a `search()`, com a query montada a partir das keywords (dedupe, limite, normalização) e nunca
 * mais de uma.
 */
describe("runPipeline — escopo definido pelo usuário", () => {
  function spyProvider(): { provider: JurisprudenceProvider; recebidas: JurisprudenceQuery[] } {
    const base = createFixtureProvider();
    const recebidas: JurisprudenceQuery[] = [];
    return {
      recebidas,
      provider: {
        ...base,
        search: (query: JurisprudenceQuery) => {
          recebidas.push(query);
          return base.search(query);
        },
      } as JurisprudenceProvider,
    };
  }

  async function rodar(input: {
    keywords?: string[];
    filters?: JurisprudenceQuery["filters"];
    auditLevel?: AuditLevel;
  }) {
    const { provider, recebidas } = spyProvider();
    const events: PipelineEvent[] = [];

    for await (const event of runPipeline(
      {
        runId: "run-escopo-0001",
        traceId: "trace-escopo-0001",
        file: {
          name: "peticao.txt",
          size: Buffer.byteLength(PETITION),
          type: "text/plain",
          bytes: Buffer.from(PETITION, "utf-8"),
        },
        ...input,
      },
      {
        repository: createInMemoryRepository(),
        llmProvider: stubLlmProvider(),
        jurisprudenceProvider: provider,
        auditLevel: input.auditLevel,
      },
    )) {
      events.push(event);
    }

    return { events, recebidas };
  }

  it("monta uma única query juntando as keywords normalizadas", async () => {
    const { recebidas } = await rodar({ keywords: ["reembolso", "despesas médicas"] });

    expect(recebidas).toHaveLength(1);
    expect(recebidas[0]!.query).toBe("reembolso despesas medicas");
  });

  it("ignora keyword repetida ou vazia", async () => {
    const { recebidas } = await rodar({ keywords: ["  ", "plano saude", "plano saude"] });

    expect(recebidas).toHaveLength(1);
    expect(recebidas[0]!.query).toBe("plano saude");
  });

  it(`limita a ${MAX_USER_KEYWORDS} keywords mesmo que mais sejam enviadas`, async () => {
    const { recebidas } = await rodar({
      keywords: ["um", "dois", "tres", "quatro", "cinco", "seis", "sete"],
    });

    expect(recebidas).toHaveLength(1);
    expect(recebidas[0]!.query.split(" ")).toHaveLength(MAX_USER_KEYWORDS);
    expect(recebidas[0]!.query).toBe("um dois tres quatro cinco");
  });

  it("aplica o recorte na única query", async () => {
    const { recebidas } = await rodar({
      keywords: ["reembolso"],
      filters: { judgingBody: "9ª Câmara Cível", periodStart: "2020-01-01" },
    });

    expect(recebidas).toHaveLength(1);
    expect(recebidas[0]!.filters).toEqual({
      judgingBody: "9ª Câmara Cível",
      periodStart: "2020-01-01",
    });
  });

  it("sem nenhuma keyword, falha explicitamente em vez de buscar vazio", async () => {
    const { events, recebidas } = await rodar({ keywords: [] });

    expect(recebidas).toHaveLength(0);
    const last = events.at(-1);
    expect(last?.type).toBe("error");
    expect((last as Extract<PipelineEvent, { type: "error" }>).error.code).toBe(
      "MISSING_SEARCH_KEYWORDS",
    );
  });

  it("em auditoria registra as keywords e a query enviada ao TJPR", async () => {
    const { events } = await rodar({ keywords: ["Plano de saúde"], auditLevel: "artifacts" });
    const search = events.find(
      (event) =>
        event.type === "stage" &&
        event.event.nodeDetail?.id === "node-07-search" &&
        event.event.status === "COMPLETED",
    );
    const tarefa = (search?.type === "stage" ? search.event.nodeDetail?.subTasks ?? [] : [])[0];

    expect(tarefa?.input).toMatchObject({
      keywords: ["Plano de saúde"],
      queryEnviada: "plano saude",
    });
  });
});
