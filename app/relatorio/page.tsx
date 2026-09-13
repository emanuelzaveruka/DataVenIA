import type { Metadata } from "next";
import Link from "next/link";
import { Envelope } from "@/components/layout/envelope";
import { Secao } from "@/components/layout/secao";
import { Grafismo } from "@/components/ui/grafismo";
import { Cartao } from "@/components/ui/cartao";
import { Kpi } from "@/components/ui/kpi";
import { Rotulo } from "@/components/ui/rotulo";
import { Botao } from "@/components/ui/botao";
import { Barra } from "@/components/ui/barra";
import { PainelPrecedentes } from "@/components/relatorio/painel-precedentes";
import { ResearchDisclaimer } from "../research-disclaimer";

export const metadata: Metadata = {
  title: "Relatório · Data VênIA",
  description: "Relatório de jurisprudência — tela de demonstração.",
};

/**
 * Tela de relatório do protótipo, sobre dados fixos.
 *
 * Não confundir com `/relatorio-demo`: aquela roda as Fases 6+7 de verdade sobre a fixture
 * versionada e renderiza o `FinalReport` real via `ReportView` — é onde os critérios de aceite de
 * HU-26/27/28 se conferem. Esta aqui é a proposta visual da equipe de design para o dashboard
 * (KPIs, distribuição, abas, tabela com filtros), que o `FinalReport` ainda não alimenta.
 *
 * O que falta para ligar de verdade está no backlog: o relatório atual é estruturado por questão
 * jurídica (`ReportIssue[]`), não por tabela de acórdãos com filtro — derivar uma visão tabular
 * agregada exige um view-model novo sobre `FinalReport`, não só troca de props.
 *
 * Os números abaixo seguem a regra de §3.10/HU-29: contagem absoluta sobre a amostra, nunca
 * percentual de êxito. O protótipo trazia "66% dos aderentes" e "aderência 92%" — ambos viraram
 * contagem e rótulo qualitativo.
 */
const AMOSTRA = { analisados: 12, aderentes: 9, sustentam: 6, camaras: 4 } as const;

const POR_RESULTADO = [
  { rotulo: "Procedente", valor: 4 },
  { rotulo: "Parcialmente procedente", valor: 3 },
  { rotulo: "Improcedente", valor: 2 },
] as const;

const POR_CAMARA = [
  { rotulo: "9ª Cível", valor: 4 },
  { rotulo: "17ª Cível", valor: 3 },
  { rotulo: "6ª Cível", valor: 3 },
  { rotulo: "11ª Cível", valor: 2 },
] as const;

export default function RelatorioPage() {
  return (
    <>
      <Grafismo className="pt-8 pb-20">
        <Envelope>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Link href="/envio" className="text-apoio font-semibold text-vn-verde-400 hover:text-vn-verde-300">
              ← Nova pesquisa
            </Link>
            <div className="flex flex-wrap gap-2">
              {/* Exportação é feature nova (fora das 38 HUs) — visível como proposta, desligada. */}
              <Botao variante="clara" disabled title="Exportação ainda não implementada">
                Exportar DOCX
              </Botao>
              <Botao variante="clara" disabled title="Exportação ainda não implementada">
                Exportar XLSX
              </Botao>
            </div>
          </div>

          <h1 className="mt-8 text-titulo font-bold tracking-[-0.01em] text-vn-creme">
            Relatório de jurisprudência
          </h1>
          <p className="mt-2 text-apoio text-vn-navy-200">
            Triagem de pesquisa, não parecer.
          </p>

          <div className="mt-10 grid grid-cols-2 gap-8 lg:grid-cols-4">
            <Kpi sobreNavy valor={AMOSTRA.analisados} rotulo="Acórdãos analisados" />
            <Kpi
              sobreNavy
              valor={AMOSTRA.aderentes}
              rotulo="Precedentes aderentes"
              apoio={`de ${AMOSTRA.analisados} analisados`}
            />
            <Kpi
              sobreNavy
              valor={AMOSTRA.sustentam}
              rotulo="Sustentam a tese"
              apoio={`de ${AMOSTRA.aderentes} aderentes`}
            />
            <Kpi sobreNavy valor={AMOSTRA.camaras} rotulo="Câmaras representadas" />
          </div>
        </Envelope>
      </Grafismo>

      <Envelope className="pb-24">
        <Cartao className="relative z-10 -mt-10 border-l-[3px] border-l-vn-info p-6">
          <h2 className="mb-2 text-apoio font-bold">Tela de demonstração</h2>
          <p className="max-w-leitura text-rotulo leading-relaxed text-vn-texto-suave">
            Os dados desta tela são fixos. O relatório gerado de verdade pelo pipeline aparece ao
            final de um envio em <Link href="/envio" className="font-semibold">Nova pesquisa</Link>, e
            há um exemplo completo sobre a fixture versionada em{" "}
            <Link href="/relatorio-demo" className="font-semibold">relatório de exemplo</Link>.
          </p>
        </Cartao>

        <Secao titulo="Distribuição dos achados">
          <div className="grid gap-6 md:grid-cols-2">
            <Cartao className="p-6">
              <Rotulo className="mb-5">Por resultado</Rotulo>
              <div className="flex flex-col gap-4">
                {POR_RESULTADO.map((item) => (
                  <Barra
                    key={item.rotulo}
                    rotulo={item.rotulo}
                    valor={item.valor}
                    total={AMOSTRA.aderentes}
                  />
                ))}
              </div>
            </Cartao>

            <Cartao className="p-6">
              <Rotulo className="mb-5">Câmaras com mais achados</Rotulo>
              <div className="flex flex-col gap-4">
                {POR_CAMARA.map((item) => (
                  <Barra
                    key={item.rotulo}
                    rotulo={item.rotulo}
                    valor={item.valor}
                    total={AMOSTRA.aderentes}
                  />
                ))}
              </div>
            </Cartao>
          </div>
        </Secao>

        <Secao titulo="Precedentes">
          <PainelPrecedentes />
        </Secao>

        <ResearchDisclaimer className="mt-10" />
      </Envelope>
    </>
  );
}
