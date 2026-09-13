import { describe, expect, it, beforeAll } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { extractText, getDocumentProxy } from "unpdf";
import { DocumentoRelatorio } from "../documento-relatorio";
import { buildDemoReport } from "../../../providers/fixtures/demo-report";
import type { FinalReport } from "../../../schemas/report.schema";

/**
 * O critério que justificou trocar `window.print()` por geração nativa.
 *
 * O PDF que o QA gerou pela impressão saiu com ZERO caracteres extraíveis e ZERO anotações de link —
 * 825 KB de imagem para 4 páginas. Estes testes existem para que isso não volte em silêncio: eles
 * leem os bytes do PDF produzido, não o React que o gerou.
 */
/**
 * ARMADILHA: `getDocumentProxy` (pdf.js) assume a POSSE do TypedArray que recebe e o deixa
 * destacado depois de ler. Reaproveitar o mesmo buffer para inspecionar bytes devolve zero — o
 * arquivo parece vazio quando na verdade foi transferido. Por isso cada consumidor recebe a sua
 * cópia, e o número de páginas é capturado aqui, não relido depois.
 */
/**
 * Relatório mínimo com UMA fonte cuja URL passa em `isOfficialTjprUrl`
 * (`/jurisprudencia/j/{id}/{segmento}`). Montado à mão porque o teste precisa controlar a política
 * de fonte, não herdá-la da fixture.
 */
function relatorioComFonteOficial(): FinalReport {
  const source = {
    processNumber: "0001234-56.2024.8.16.0004",
    court: "TJPR",
    chamber: "9ª Câmara Cível",
    judge: "Des. A. Marques",
    judgmentDate: "2024-03-18",
    url: "https://portal.tjpr.jus.br/jurisprudencia/j/4100000/Acordao-0001234-56.2024.8.16.0004",
    sourceHash: "hash-teste",
  };

  return {
    reportId: "REP-LINK",
    schemaVersion: "1.0.0",
    generatedAt: "2026-09-13T10:00:00.000Z",
    disclaimer:
      "Resultado de apoio à pesquisa. Confirme a fonte e realize revisão jurídica independente.",
    caseSummary: { parties: {}, requests: ["Pedido"], facts: [] },
    issues: [
      {
        legalIssueId: "LI-01",
        topic: "Questão com fonte oficial",
        question: "A fonte é rastreável?",
        relevance: "HIGH",
        classification: "TENDENCIA_FAVORAVEL",
        classificationReason: "Amostra com citação verificada.",
        trend: {
          analyzedCount: 9,
          supportingCount: 6,
          opposingCount: 2,
          mixedCount: 1,
          summary: "6 de 9 decisões analisadas sustentam a tese.",
          convergence: "MODERADA",
        },
        recurringFactors: [],
        favorablePoints: [
          {
            argument: "Argumento sustentado",
            quote: "Trecho conferido na decisão original.",
            context: "Contexto",
            evidenceId: "EV-01",
            scratchpadId: "SP-01",
            source,
          },
        ],
        contraryPoints: [],
        contraryPointsNotice: "Nenhum precedente contrário identificado na amostra.",
        risks: [],
        distinguishing: [],
        suggestedArguments: [],
      },
    ],
    sample: { analyzedDecisions: 9, verifiedEvidence: 1, omittedItems: 0 },
    omissions: [],
  };
}

let bytes: Buffer;
let texto: string;
let paginas: number;
let relatorio: FinalReport;

beforeAll(async () => {
  const demo = await buildDemoReport();
  if (demo.isError) throw new Error(`fixture falhou: ${demo.error.code}`);
  relatorio = demo.data;

  bytes = await renderToBuffer(
    <DocumentoRelatorio report={relatorio} fileName="peticao-inicial.pdf" runId="run-teste-0001" />,
  );

  const doc = await getDocumentProxy(new Uint8Array(Buffer.from(bytes)));
  paginas = doc.numPages;
  texto = (await extractText(doc, { mergePages: true })).text;
}, 60_000);

describe("DocumentoRelatorio — bytes do PDF", () => {
  it("produz texto extraível, não uma imagem de página", () => {
    // A falha original: 0 caracteres em 4 páginas.
    expect(texto.replace(/\s/g, "").length).toBeGreaterThan(500);
  });

  it("preserva acentuação e sinais jurídicos", () => {
    for (const termo of ["Relatório", "jurisprudencial", "Questões", "Órgão julgador", "Câmara"]) {
      expect(texto).toContain(termo);
    }
  });

  it("gera anotação de link clicável para cada fonte oficial", async () => {
    // O relatório de demonstração não serve para este caso: desde que a fixture passou a usar host
    // `.invalid` (HU-27), os achados dela são recusados como fonte e não viram link — corretamente.
    // Então o teste monta a própria entrada, com uma URL que o portal aceita.
    const comFonte = await renderToBuffer(
      <DocumentoRelatorio
        report={relatorioComFonteOficial()}
        fileName="peca.pdf"
        runId="run-link-0001"
      />,
    );

    // Lido dos BYTES, não pela API do pdf.js: `getAnnotations()` roda no worker e estoura
    // DataCloneError ao transferir o objeto de anotação. O byte é a verdade do arquivo de qualquer
    // forma — foi a ausência dele no PDF do QA que motivou esta feature.
    const cru = comFonte.toString("latin1");
    const anotacoes = cru.match(/\/Subtype\s*\/Link/g) ?? [];
    const urls = [...cru.matchAll(/\/URI\s*\(([^)]*)\)/g)].map((m) => m[1] ?? "");

    expect(anotacoes.length).toBeGreaterThan(0);
    expect(urls.length).toBe(anotacoes.length);
    expect(urls.every((u) => u.startsWith("https://portal.tjpr.jus.br/"))).toBe(true);
  }, 60_000);

  it("escreve a URL por extenso, para quem lê no papel", () => {
    // No papel não se clica: sem a URL escrita, a proveniência de HU-27 morre na exportação.
    expect(texto).toMatch(/https:\/\/\S+/);
  });

  it("carrega a identificação da execução", () => {
    expect(texto).toContain("peticao-inicial.pdf");
    expect(texto).toContain("run-teste-0001");
    expect(texto).toContain(relatorio.reportId);
  });

  it("imprime o aviso obrigatório de HU-28", () => {
    // O PDF circula longe da tela onde a ressalva estava; aqui ela importa mais, não menos.
    expect(texto).toContain("apoio à pesquisa");
    expect(texto).toContain("não é parecer jurídico");
  });

  it("não carrega nada da aplicação — navegação, botão ou formulário", () => {
    for (const ruido of ["Enviar documento", "Visualizar orquestração", "Escopo da busca", "Histórico"]) {
      expect(texto).not.toContain(ruido);
    }
  });

  it("numera as páginas e repete o cabeçalho do documento", () => {
    expect(paginas).toBeGreaterThan(0);
    // Cabeçalho fixo em toda página + a marca da capa.
    expect(texto.split("Data VênIA").length - 1).toBeGreaterThanOrEqual(paginas);
    // Numeração própria do PDF, não a do navegador.
    expect(texto).toMatch(new RegExp(`1 / ${paginas}`));
  });

  it("nunca escreve percentual sem o denominador na mesma linha", () => {
    // §3.10/HU-29: o que separa "fato sobre a amostra" de "chance de ganhar".
    const linhasComPercentual = texto.split("\n").filter((l) => /\d+%/.test(l));
    for (const linha of linhasComPercentual) {
      expect(linha).toMatch(/\d+\s+de\s+\d+|da amostra/);
    }
  });
});
