import type { Metadata } from "next";
import { Envelope } from "@/components/layout/envelope";
import { Secao } from "@/components/layout/secao";
import { Grafismo } from "@/components/ui/grafismo";
import { Cartao } from "@/components/ui/cartao";
import { Botao } from "@/components/ui/botao";
import { Rotulo } from "@/components/ui/rotulo";
import { Marcador } from "@/components/ui/marcador";
import { Campo, RotuloCampo } from "@/components/ui/campo";
import { Chip } from "@/components/ui/chip";
import { Kpi } from "@/components/ui/kpi";
import { Regua } from "@/components/ui/regua";
import { Rolagem, Tabela, Thead, Tbody, Th, Td } from "@/components/ui/tabela";

export const metadata: Metadata = {
  title: "Design system · Data VênIA",
  description: "Tokens, componentes e limites de contraste da identidade Data VênIA.",
};

/**
 * Catálogo vivo do design system.
 *
 * Renderiza os MESMOS componentes que as telas de produto usam (`components/ui/*`), nunca cópias
 * estilizadas à mão. Se um botão mudar aqui e não mudar no envio, é porque alguém duplicou em vez
 * de usar a primitiva — e esta página existe justamente para esse desvio ficar visível.
 */
/**
 * As classes precisam estar escritas por extenso. O Tailwind varre o código como TEXTO — uma
 * classe montada por interpolação (`bg-vn-navy-${tom}`) nunca é encontrada e a cor simplesmente
 * não é gerada, sem erro de build. Por isso o par [rótulo, classe literal].
 */
const NAVY = [
  ["100", "bg-vn-navy-100"], ["200", "bg-vn-navy-200"], ["300", "bg-vn-navy-300"],
  ["400", "bg-vn-navy-400"], ["500", "bg-vn-navy-500"], ["600", "bg-vn-navy-600"],
  ["700", "bg-vn-navy-700"], ["800", "bg-vn-navy-800"], ["900", "bg-vn-navy-900"],
] as const;

const VERDE = [
  ["100", "bg-vn-verde-100"], ["200", "bg-vn-verde-200"], ["300", "bg-vn-verde-300"],
  ["400", "bg-vn-verde-400"], ["500", "bg-vn-verde-500"], ["600", "bg-vn-verde-600"],
  ["700", "bg-vn-verde-700"], ["800", "bg-vn-verde-800"], ["900", "bg-vn-verde-900"],
] as const;

const PAPEL = [
  ["0", "bg-vn-papel-0"], ["50", "bg-vn-papel-50"], ["100", "bg-vn-papel-100"],
  ["200", "bg-vn-papel-200"], ["400", "bg-vn-papel-400"],
] as const;

const ESTADO = [
  { nome: "Sucesso", classe: "bg-vn-sucesso" },
  { nome: "Informação", classe: "bg-vn-info" },
  { nome: "Atenção", classe: "bg-vn-atencao" },
  { nome: "Crítico", classe: "bg-vn-critico" },
] as const;

const CONTRASTE = [
  {
    par: "Branco sobre verde-500",
    razao: "4,62:1",
    onde: "Só em texto ≥14px e em botão. Não use em legenda de 12px.",
  },
  {
    par: "Branco sobre crítico",
    razao: "4,51:1",
    onde: "Só em marcador (12px bold, caixa alta). Não use em parágrafo.",
  },
  {
    par: "Navy-400 sobre navy-800/900",
    razao: "2,9:1",
    onde: "Não use. Para texto de apoio sobre navy, use navy-200 ou navy-300.",
  },
  {
    par: "Navy-500 sobre creme",
    razao: "7,1:1",
    onde: "Texto de apoio padrão. Aprovado em qualquer tamanho.",
  },
  {
    par: "Verde-600 sobre creme/branco",
    razao: "5,3:1",
    onde: "Cor de link e de ação de texto.",
  },
  {
    par: "Navy-800 sobre creme",
    razao: "13,4:1",
    onde: "Texto principal. Aprovado em qualquer tamanho.",
  },
] as const;

function Amostra({ rotulo, classe, escuro = false }: { rotulo: string; classe: string; escuro?: boolean }) {
  return (
    <div>
      <div className={`h-14 border border-vn-borda ${classe}`} />
      <div className={`mt-1.5 text-legenda ${escuro ? "text-vn-texto" : "text-vn-texto-suave"}`}>
        {rotulo}
      </div>
    </div>
  );
}

export default function DesignSystemPage() {
  return (
    <>
      <Grafismo className="py-14">
        <Envelope>
          <Rotulo className="text-vn-verde-400">Identidade visual · front-end</Rotulo>
          <h1 className="mt-4 text-display font-extrabold tracking-[-0.02em] text-vn-creme">
            Design system
          </h1>
          <p className="mt-4 max-w-prosa text-corpo leading-relaxed text-vn-navy-200">
            O que toda tela do Data VênIA deve seguir. Os componentes desta página são os mesmos de
            <code className="mx-1 bg-vn-navy-700 px-1.5 py-0.5 text-apoio">components/ui</code>
            usados em produção.
          </p>
        </Envelope>
      </Grafismo>

      <Envelope className="pb-24">
        <Secao titulo="Paleta" descricao="Navy é estrutura, verde é ação, papel é superfície.">
          <div className="flex flex-col gap-8">
            <div>
              <Rotulo className="mb-3">Navy</Rotulo>
              <div className="grid grid-cols-3 gap-3 md:grid-cols-9">
                {NAVY.map(([tom, classe]) => (
                  <Amostra key={tom} rotulo={tom} classe={classe} />
                ))}
              </div>
            </div>

            <div>
              <Rotulo className="mb-3">Verde</Rotulo>
              <div className="grid grid-cols-3 gap-3 md:grid-cols-9">
                {VERDE.map(([tom, classe]) => (
                  <Amostra key={tom} rotulo={tom} classe={classe} />
                ))}
              </div>
            </div>

            <div>
              <Rotulo className="mb-3">Papel</Rotulo>
              <div className="grid grid-cols-3 gap-3 md:grid-cols-5">
                {PAPEL.map(([tom, classe]) => (
                  <Amostra key={tom} rotulo={tom} classe={classe} />
                ))}
              </div>
            </div>

            <div>
              <Rotulo className="mb-3">Cores de estado</Rotulo>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {ESTADO.map((cor) => (
                  <Amostra key={cor.nome} rotulo={cor.nome} classe={cor.classe} />
                ))}
              </div>
            </div>
          </div>
        </Secao>

        <Secao titulo="Tipografia" descricao="Manrope, única família. Numeral tabular em todo dado.">
          <Cartao className="divide-y divide-vn-borda">
            {[
              { amostra: <span className="text-display font-extrabold tracking-[-0.02em]">Data VênIA</span>, nome: "Display · 44/800" },
              { amostra: <span className="text-titulo font-bold tracking-[-0.01em]">Análise de acórdãos</span>, nome: "Título · 28/700" },
              { amostra: <span className="text-sub font-semibold">Precedentes por câmara</span>, nome: "Subtítulo · 20/600" },
              { amostra: <span className="text-corpo">O relatório traz cada achado com a fonte ao lado.</span>, nome: "Corpo · 16/400" },
              { amostra: <Rotulo>Situação do processo</Rotulo>, nome: "Rótulo · 13/600" },
              { amostra: <span className="num text-[32px] font-extrabold">1.310</span>, nome: "Dado · 32/800 tabular" },
            ].map((linha) => (
              <div key={linha.nome} className="flex flex-wrap items-baseline justify-between gap-4 p-6">
                <div>{linha.amostra}</div>
                <div className="text-legenda text-vn-texto-suave">{linha.nome}</div>
              </div>
            ))}
          </Cartao>
        </Secao>

        <Secao titulo="Componentes">
          <div className="grid gap-6 md:grid-cols-2">
            <Cartao className="p-6">
              <Rotulo className="mb-4">Ações</Rotulo>
              <div className="flex flex-wrap items-center gap-3">
                <Botao variante="primaria">Analisar peça</Botao>
                <Botao variante="secundaria">Secundária</Botao>
                <Botao variante="texto">Ação de texto</Botao>
                <Botao disabled>Desabilitada</Botao>
              </div>
            </Cartao>

            <Cartao className="p-6">
              <Rotulo className="mb-4">Marcadores</Rotulo>
              <div className="flex flex-wrap items-center gap-2">
                <Marcador tom="procedente">Procedente</Marcador>
                <Marcador tom="parcial">Em análise</Marcador>
                <Marcador tom="atencao">Prazo curto</Marcador>
                <Marcador tom="improcedente">Improcedente</Marcador>
                <Chip>Consumidor</Chip>
              </div>
              <p className="mt-4 text-legenda leading-relaxed text-vn-texto-suave">
                Marcador descreve estado operacional ou desfecho já ocorrido. Nunca chance de êxito
                — o produto é proibido de prever resultado (§3.10/HU-29).
              </p>
            </Cartao>

            <Cartao className="p-6">
              <Rotulo className="mb-4">Campo de busca</Rotulo>
              <RotuloCampo htmlFor="ds-consulta">Consulta</RotuloCampo>
              <Campo id="ds-consulta" placeholder="Vício do produto, art. 18 do CDC" />
              <p className="mt-3 text-legenda text-vn-texto-suave">
                Clique no campo para ver o anel de foco — verde 500 a 28%, o mesmo em todo controle.
              </p>
            </Cartao>

            <Cartao className="p-6">
              <Rotulo className="mb-4">Cartão de indicador</Rotulo>
              <Kpi valor="1.310" rotulo="Acórdãos analisados" apoio="amostra desta execução" />
              <Regua className="mt-5" />
            </Cartao>
          </div>
        </Secao>

        <Secao
          titulo="Combinações de fundo"
          descricao="Quatro combinações; a quarta existe para ser recusada."
        >
          <div className="grid gap-4 md:grid-cols-4">
            <Cartao className="bg-vn-creme p-6">
              <div className="text-sub font-semibold text-vn-navy-800">Navy sobre creme</div>
              <div className="mt-2 text-legenda text-vn-texto-suave">Permitido · leitura padrão</div>
            </Cartao>
            <div className="border border-vn-borda bg-vn-navy-800 p-6">
              <div className="text-sub font-semibold text-vn-creme">Creme sobre navy</div>
              <div className="mt-2 text-legenda text-vn-navy-300">Permitido · cabeçalho, KPI</div>
            </div>
            <div className="border border-vn-borda bg-vn-acao p-6">
              <div className="text-sub font-semibold text-white">Branco sobre verde</div>
              <div className="mt-2 text-legenda text-vn-verde-100">Permitido · botão, faixa curta</div>
            </div>
            <div className="border border-vn-critico bg-vn-acao p-6">
              <div className="text-sub font-semibold text-vn-navy-800">Navy sobre verde</div>
              <div className="mt-2 text-legenda font-bold text-white">Proibido · 3,9:1</div>
            </div>
          </div>
        </Secao>

        <Secao titulo="Limites de contraste">
          <Cartao className="overflow-hidden">
            <Rolagem>
              <Tabela>
                <Thead>
                  <Th>Combinação</Th>
                  <Th>Razão</Th>
                  <Th>Onde pode usar</Th>
                </Thead>
                <Tbody>
                  {CONTRASTE.map((linha) => (
                    <tr key={linha.par}>
                      <Td className="font-medium whitespace-nowrap">{linha.par}</Td>
                      <Td className="num whitespace-nowrap">{linha.razao}</Td>
                      <Td>{linha.onde}</Td>
                    </tr>
                  ))}
                </Tbody>
              </Tabela>
            </Rolagem>
          </Cartao>
        </Secao>
      </Envelope>
    </>
  );
}
