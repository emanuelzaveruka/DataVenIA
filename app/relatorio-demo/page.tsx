import Link from "next/link";
import { buildDemoReport } from "../../lib/providers/fixtures/demo-report";
import { ReportView } from "../report-view";

export const dynamic = "force-static";

/**
 * Tela de resultado em modo de demonstração (HU-37 / critério de aceite 16). Roda sobre a fixture
 * versionada — sem rede e sem chamada de modelo — e é onde os critérios de aceite de HU-26/27/28
 * podem ser conferidos no navegador.
 *
 * Desde 2026-09-13 ela demonstra a estrutura e o caminho das omissões, não achados com fonte: como
 * as decisões da fixture são inventadas, nenhuma passa no portão de HU-27 e todas são registradas
 * em `report.omissions`. É menos vistoso e é o comportamento correto — antes, a demo exibia acórdão
 * fictício com link para o portal do TJPR que respondia 404.
 */
export default async function ReportDemoPage() {
  const result = await buildDemoReport();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-4 py-12">
      <header className="flex flex-col gap-2">
        <Link href="/" className="text-sm text-ink-600 underline underline-offset-2 dark:text-ink-400">
          ← Voltar ao envio de documento
        </Link>
        <h1 className="text-2xl font-semibold">Relatório de pesquisa jurisprudencial</h1>
        <p className="text-sm text-ink-600 dark:text-ink-400">
          Demonstração com jurisprudência fictícia versionada — nenhum dado corresponde a processo
          ou pessoa real. Por isso <strong>nenhum achado aparece com fonte</strong>: o relatório só
          exibe uma decisão quando existe o metadado real de onde ela saiu. Abra &quot;Ver o que foi
          omitido e por quê&quot;, no rodapé, para ver o que a demonstração processou e reteve.
        </p>
      </header>

      {result.isError ? (
        <p className="rounded-lg border border-danger bg-ink-100 p-3 text-sm text-danger dark:border-danger-dark dark:bg-ink-800 dark:text-danger-dark">
          {result.error.userMessage ?? result.error.description}
        </p>
      ) : (
        <ReportView report={result.data} />
      )}
    </main>
  );
}
