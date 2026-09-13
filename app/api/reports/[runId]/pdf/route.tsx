import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getRepository } from "../../../../../lib/persistence/get-repository";
import { statusForError } from "../../../../../lib/errors/http-status";
import { DocumentoRelatorio } from "../../../../../lib/report/pdf/documento-relatorio";

export const runtime = "nodejs";

/**
 * Download do relatório em PDF nativo.
 *
 * `GET /api/reports/<runId>/pdf` → snapshot persistido do `FinalReport` → documento → bytes.
 *
 * **A fonte é o runId, nunca a tela.** O PDF é montado a partir do que foi persistido na execução,
 * não de HTML nem de estado do navegador: dois downloads do mesmo runId produzem o mesmo documento,
 * e um relatório baixado semanas depois continua sendo o que foi gerado, não o que a interface
 * mostraria hoje.
 *
 * **Limitação conhecida**: o repositório padrão é em memória (`getRepository`), então o snapshot
 * vive enquanto o processo viver. Em dev e em instância única isso basta; para um link de download
 * que sobreviva a deploy e valha em serverless multi-instância, é preciso o Supabase provisionado.
 * Não é falha desta rota — é a persistência que a feature herda.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;

  if (!runId) {
    return NextResponse.json(
      { error: { code: "MISSING_RUN_ID", userMessage: "Informe a execução a baixar." } },
      { status: 400 },
    );
  }

  let repository;
  try {
    repository = getRepository();
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "REPOSITORY_UNAVAILABLE",
          userMessage: "Não foi possível acessar o armazenamento da execução.",
        },
      },
      { status: 500 },
    );
  }

  const snapshot = await repository.loadRun(runId);
  if (snapshot.isError) {
    return NextResponse.json({ error: snapshot.error }, { status: statusForError(snapshot.error) });
  }

  const report = snapshot.data?.report?.content;
  if (!report) {
    // Distingue "não existe" de "existe mas não terminou": a segunda é recuperável esperando.
    const existe = Boolean(snapshot.data?.run);
    return NextResponse.json(
      {
        error: {
          code: existe ? "REPORT_NOT_READY" : "RUN_NOT_FOUND",
          userMessage: existe
            ? "Esta análise ainda não produziu relatório."
            : "Esta análise não está mais disponível. Envie o documento novamente.",
        },
      },
      { status: 404 },
    );
  }

  const fileName = snapshot.data?.document?.fileName ?? "peca";

  const bytes = await renderToBuffer(
    <DocumentoRelatorio report={report} fileName={fileName} runId={runId} />,
  );

  // Nome previsível: quem baixa dois relatórios precisa distinguir os arquivos sem abrir.
  const base = fileName.replace(/\.[^.]+$/, "").replace(/[^\w\-.]+/g, "-");
  const nomeArquivo = `Relatorio-${base}-${runId.slice(0, 8)}.pdf`;

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
      "Content-Length": String(bytes.length),
      // O relatório é de um caso concreto: nenhum intermediário deve guardar cópia.
      "Cache-Control": "private, no-store",
    },
  });
}
