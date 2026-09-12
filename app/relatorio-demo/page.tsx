import Link from "next/link";
import { buildDemoReport } from "../../lib/providers/fixtures/demo-report";
import { ReportView } from "../report-view";

export const dynamic = "force-static";

/**
 * Tela de resultado em modo de demonstração (HU-37 / critério de aceite 16). Roda sobre a fixture
 * versionada — sem rede e sem chamada de modelo — e é onde os critérios de aceite de HU-26/27/28
 * podem ser conferidos no navegador enquanto o pipeline completo ainda não está ligado à rota de
 * upload (ver CLAUDE.md, Fase 7).
 */
export default async function ReportDemoPage() {
  const result = await buildDemoReport();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-4 py-12">
      <header className="flex flex-col gap-2">
        <Link href="/" className="text-sm text-neutral-500 underline underline-offset-2">
          ← Voltar ao envio de documento
        </Link>
        <h1 className="text-2xl font-semibold">Relatório de pesquisa jurisprudencial</h1>
        <p className="text-sm text-neutral-500">
          Demonstração com jurisprudência fictícia versionada — nenhum dado corresponde a processo
          ou pessoa real.
        </p>
      </header>

      {result.isError ? (
        <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
          {result.error.userMessage ?? result.error.description}
        </p>
      ) : (
        <ReportView report={result.data} />
      )}
    </main>
  );
}
