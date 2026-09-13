import type { Metadata } from "next";
import { buildDemoReport } from "@/lib/providers/fixtures/demo-report";
import { PainelRelatorio } from "@/components/relatorio/painel-relatorio";
import { Envelope } from "@/components/layout/envelope";
import { Cartao } from "@/components/ui/cartao";
import { ResearchDisclaimer } from "../research-disclaimer";

export const metadata: Metadata = {
  title: "Relatório · Data VênIA",
  description: "Leitura em painel do relatório de jurisprudência.",
};

/**
 * Painel do relatório.
 *
 * Renderiza o relatório da última análise feita nesta aba; quando não há nenhuma, cai no relatório
 * de demonstração — que **não é mock**: sai das Fases 6+7 de verdade sobre a fixture versionada
 * (`buildDemoReport`), sem rede e sem modelo. Os dois caminhos mostram números derivados de um
 * `FinalReport` real, e a tela diz qual dos dois está em cena.
 *
 * O relatório da análise mora no `sessionStorage` (HU-06: dados da sessão morrem com a aba), então
 * a escolha entre um e outro só pode acontecer no cliente. O servidor monta a demonstração porque é
 * o único dos dois que ele consegue conhecer — e ela também serve de estado inicial enquanto o
 * cliente não montou.
 *
 * Não confundir com `/relatorio-demo`, que renderiza o mesmo relatório no formato de LEITURA
 * (`ReportView`, por questão jurídica) e é onde HU-26/27/28 se conferem. Aqui a leitura é
 * transversal: contagem, distribuição e tabela.
 */
export default async function RelatorioPage() {
  const demo = await buildDemoReport();

  if (demo.isError) {
    return (
      <Envelope className="py-16">
        <Cartao className="border-l-[3px] border-l-vn-critico p-6">
          <h1 className="mb-2 text-sub font-semibold">Não foi possível montar o painel</h1>
          <p className="max-w-leitura text-apoio leading-relaxed text-vn-texto-suave">
            {demo.error.userMessage ?? demo.error.description}
          </p>
        </Cartao>
      </Envelope>
    );
  }

  return (
    <>
      <PainelRelatorio demo={demo.data} />
      <Envelope className="pb-16">
        <ResearchDisclaimer />
      </Envelope>
    </>
  );
}
