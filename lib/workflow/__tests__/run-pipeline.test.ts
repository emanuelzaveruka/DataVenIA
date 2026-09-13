import { describe, expect, it } from "vitest";
import { runPipeline, type PipelineEvent } from "../run-pipeline";
import { createInMemoryRepository } from "../../persistence/in-memory-repository";
import { createFixtureProvider } from "../../providers/fixture";
import { FIXTURE_RAW_DECISIONS } from "../../providers/fixtures/tjpr-demo-case";
import { parseStructuredOutput } from "../../llm/validate-structured-output";
import { toolFailure } from "../../errors/tool-result";
import { createAppError } from "../../errors/app-error";
import type { GenerateStructuredParams, LlmProvider } from "../../llm/provider";
import type { DataVeniaRepository } from "../../persistence/repository";
import type { JurisprudenceProvider } from "../../providers/jurisprudence-provider";
import type { JurisprudenceQuery } from "../../schemas/search.schema";

const CASE_ANALYSIS = {
  processNumber: "0009876-54.2025.8.16.0001",
  court: "TJPR",
  chamber: "9ª Câmara Cível",
  parties: { plaintiff: "[PARTE_1]", defendant: "[PARTE_2] Saúde S.A." },
  facts: ["Beneficiária teve negada a cobertura de procedimento cirúrgico prescrito."],
  requests: ["Cobertura integral do procedimento prescrito"],
  legalIssues: [
    {
      id: "LI-01",
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

const QUERY_PLAN = {
  queries: [
    {
      query: "plano de saúde negativa de cobertura abusiva",
      reason: "Busca a tese principal do cliente.",
      intent: "MAIN_THESIS",
      legalIssueId: "LI-01",
    },
    {
      query: "plano de saúde negativa de cobertura válida exclusão específica",
      reason: "Busca jurisprudência contrária à tese.",
      intent: "CONTRARY",
      legalIssueId: "LI-01",
    },
  ],
};

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
    legalIssueId: "LI-01",
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
        case "SearchQueryPlan":
          return parseStructuredOutput(params.schema, params.schemaName, QUERY_PLAN, "stub");
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

const PETITION = `EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DE DIREITO

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
    },
    {
      repository,
      llmProvider: stubLlmProvider(options),
      jurisprudenceProvider: createFixtureProvider(),
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
      const terminal = stages.findIndex(
        (event, index) => index > startIndex && event.event.nodeDetail?.id === id,
      );

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
});

/**
 * Termos e recorte escolhidos pelo usuário na tela de envio.
 *
 * O que está sendo protegido: os termos dele SOMAM às queries do modelo. Se um dia passarem a
 * substituí-las, a busca por jurisprudência contrária de HU-11 some sem ninguém perceber — e o
 * relatório continua afirmando "nenhum precedente contrário identificado na amostra", que passaria
 * a ser verdade sobre a busca, não sobre o acervo.
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

  async function rodar(input: { extraTerms?: string[]; filters?: JurisprudenceQuery["filters"] }) {
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
      },
    )) {
      events.push(event);
    }

    return { events, recebidas };
  }

  it("busca os termos do usuário ALÉM das queries do modelo, nunca no lugar delas", async () => {
    const { recebidas } = await rodar({ extraTerms: ["reembolso de despesas médicas"] });

    const buscados = recebidas.map((item) => item.query);
    // As duas do modelo continuam inteiras — inclusive a CONTRARY, que é o ponto.
    for (const doModelo of QUERY_PLAN.queries) {
      expect(buscados).toContain(doModelo.query);
    }
    expect(buscados).toContain("reembolso de despesas médicas");
    expect(buscados).toHaveLength(QUERY_PLAN.queries.length + 1);
  });

  it("ignora termo repetido, vazio ou igual ao que o modelo já gerou", async () => {
    const { recebidas } = await rodar({
      extraTerms: ["  ", "novo termo", "novo termo", QUERY_PLAN.queries[0]!.query],
    });

    expect(recebidas.map((item) => item.query)).toHaveLength(QUERY_PLAN.queries.length + 1);
  });

  it("aplica o recorte em todas as queries, não só em algumas", async () => {
    const { recebidas } = await rodar({
      extraTerms: ["reembolso de despesas médicas"],
      filters: { judgingBody: "9ª Câmara Cível", periodStart: "2020-01-01" },
    });

    expect(recebidas.length).toBeGreaterThan(1);
    for (const recebida of recebidas) {
      expect(recebida.filters).toEqual({
        judgingBody: "9ª Câmara Cível",
        periodStart: "2020-01-01",
      });
    }
  });

  it("sem escopo, busca exatamente o que o modelo gerou", async () => {
    const { recebidas } = await rodar({});
    expect(recebidas.map((item) => item.query)).toEqual(QUERY_PLAN.queries.map((q) => q.query));
    expect(recebidas.every((item) => item.filters === undefined)).toBe(true);
  });
});
