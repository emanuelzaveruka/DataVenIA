import Link from "next/link";
import { Envelope } from "@/components/layout/envelope";
import { Secao } from "@/components/layout/secao";
import { Grafismo } from "@/components/ui/grafismo";
import { Cartao } from "@/components/ui/cartao";
import { Rotulo } from "@/components/ui/rotulo";
import { Kpi } from "@/components/ui/kpi";
import { Regua } from "@/components/ui/regua";
import { ResearchDisclaimer } from "./research-disclaimer";

/**
 * Landing — apresentação do produto.
 *
 * Os números da faixa de indicadores são a copy do protótipo da equipe de design. Hoje a aplicação
 * roda sobre fixture versionada (9 acórdãos fictícios), então eles são material de apresentação,
 * não leitura do acervo. Estão isolados nesta constante justamente para que trocá-los por dado
 * real — ou removê-los antes de uma demonstração pública — seja uma edição, não uma caçada.
 */
const INDICADORES = [
  { valor: "1.248.930", rotulo: "Acórdãos indexados" },
  { valor: "24", rotulo: "Câmaras cobertas" },
  { valor: "3 min", rotulo: "Tempo médio do relatório" },
  { valor: "100%", rotulo: "Achados com link de fonte" },
] as const;

const ETAPAS = [
  {
    numero: "01",
    titulo: "Envio da peça",
    texto:
      "PDF, DOCX ou TXT. CPF, CNPJ, endereço, telefone, e-mail e nomes não essenciais são mascarados antes de o conteúdo seguir para análise.",
  },
  {
    numero: "02",
    titulo: "Extração das teses",
    texto:
      "O sistema identifica os pedidos, a matéria e os fundamentos, e monta a estratégia de busca no acervo do TJPR.",
  },
  {
    numero: "03",
    titulo: "Relatório com fonte",
    texto:
      "Cada precedente vem com número do acórdão, câmara, relator, resultado e o link do inteiro teor. Sem citação que você não consiga conferir.",
  },
] as const;

const PRIVACIDADE = [
  "Dados pessoais identificáveis — CPF/CNPJ, endereço, telefone, e-mail, nomes de partes não essenciais — são mascarados automaticamente antes de qualquer análise.",
  "O conteúdo do seu documento não é usado para treinar modelos e não é compartilhado além do necessário para gerar o relatório desta sessão.",
  "Por padrão, os dados da sessão são descartados ao fechar o navegador, exceto o cache público de jurisprudência do TJPR, que não contém dados de clientes.",
] as const;

export default function Home() {
  return (
    <>
      <Grafismo className="pb-24 pt-12">
        <Envelope>
          <Rotulo className="text-vn-verde-400">Jurisprudência TJPR</Rotulo>
          <h1 className="mt-4 max-w-[18ch] text-display font-extrabold tracking-[-0.02em] text-vn-creme">
            Pesquisa de precedentes com relatório verificável
          </h1>
          <p className="mt-5 max-w-prosa text-corpo leading-relaxed text-vn-navy-200">
            Envie uma petição, decisão, recurso ou manifestação. O Data VênIA localiza os acórdãos
            do Tribunal de Justiça do Paraná que conversam com a sua tese e devolve cada achado com
            a fonte ao lado, para você conferir.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/envio"
              className="inline-flex items-center rounded-controle bg-vn-acao px-6 py-3.5 text-[15px] font-semibold text-white transition-colors ease-vn hover:bg-vn-verde-400 hover:text-vn-navy-900"
            >
              Enviar documento
            </Link>
            <Link
              href="/relatorio-demo"
              className="inline-flex items-center px-2 py-3 text-apoio font-semibold text-vn-verde-400 hover:text-vn-verde-300 hover:underline"
            >
              Ver relatório de exemplo →
            </Link>
          </div>

          <p className="mt-5 text-rotulo text-vn-navy-300">
            PDF, DOCX ou TXT. Dados pessoais identificáveis são mascarados antes de qualquer
            análise.
          </p>
        </Envelope>
      </Grafismo>

      <Envelope className="pb-24">
        {/* a faixa sobe sobre o navy de propósito — costura o cabeçalho ao corpo creme */}
        <section className="relative z-10 -mt-11">
          <Cartao className="grid grid-cols-2 gap-px bg-vn-borda lg:grid-cols-4">
            {INDICADORES.map((indicador) => (
              <div key={indicador.rotulo} className="bg-vn-superficie p-6">
                <Kpi valor={indicador.valor} rotulo={indicador.rotulo} />
              </div>
            ))}
          </Cartao>
        </section>

        <Secao
          titulo="Como funciona"
          descricao="Três etapas. Nenhuma delas substitui a sua revisão — o relatório é material de apoio à pesquisa."
        >
          <div className="grid gap-6 md:grid-cols-3">
            {ETAPAS.map((etapa) => (
              <Cartao key={etapa.numero} className="p-6">
                <div className="num text-titulo font-extrabold text-vn-verde-500">{etapa.numero}</div>
                <Regua className="my-4 w-8" />
                <h3 className="text-sub font-semibold">{etapa.titulo}</h3>
                <p className="mt-2 text-apoio leading-relaxed text-vn-texto-suave">{etapa.texto}</p>
              </Cartao>
            ))}
          </div>
        </Secao>

        <Secao titulo="Como tratamos os seus dados" descricao="Antes de enviar.">
          <Cartao className="p-8">
            <ul className="flex flex-col gap-4">
              {PRIVACIDADE.map((item) => (
                <li key={item} className="flex gap-3.5">
                  <span aria-hidden="true" className="mt-2.5 block h-regua w-4 shrink-0 bg-vn-acao" />
                  <p className="max-w-leitura text-apoio leading-relaxed text-vn-texto-suave">{item}</p>
                </li>
              ))}
            </ul>
          </Cartao>

          <ResearchDisclaimer className="mt-6" />
        </Secao>
      </Envelope>
    </>
  );
}
