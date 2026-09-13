"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import type { FinalReport } from "@/lib/schemas/report.schema";
import {
  buildRelatorioDashboard,
  precedentesParaCsv,
  type PrecedenteLinha,
  type RelatorioDashboard,
} from "@/lib/report/report-dashboard";
import { assinarRelatorio, snapshotNoServidor, snapshotRelatorio } from "./ultimo-relatorio";
import { Envelope } from "../layout/envelope";
import { Secao } from "../layout/secao";
import { Grafismo } from "../ui/grafismo";
import { Cartao } from "../ui/cartao";
import { Botao } from "../ui/botao";
import { Rotulo } from "../ui/rotulo";
import { Kpi } from "../ui/kpi";
import { Marcador } from "../ui/marcador";
import { Barra } from "../ui/barra";
import { Abas } from "../ui/abas";
import { Campo, Selecao, RotuloCampo } from "../ui/campo";
import { Rolagem, Tabela, Thead, Tbody, Th, Td } from "../ui/tabela";

/**
 * Painel do relatório — a leitura transversal "quantos, de onde, de quando".
 *
 * Renderiza um `FinalReport` REAL: o da última análise desta aba, ou, quando não há nenhuma, o
 * relatório de demonstração, que também é real (Fases 6+7 sobre a fixture versionada). Em nenhum
 * dos dois casos há número inventado — a origem fica dita na tela, porque um painel cheio de
 * números sem dizer de onde vieram é a forma mais fácil de um protótipo ser confundido com
 * resultado.
 *
 * Toda a derivação vive em `lib/report/report-dashboard.ts`, testada sem React. Aqui só há
 * apresentação, filtro de tabela e o download do CSV.
 *
 * **Contagem, nunca percentual** (§3.10/HU-29): cada número aparece com o total de onde saiu. A
 * barra mostra proporção visual, mas o texto ao lado é sempre "N de M" — o produto não prevê
 * êxito, e um "67%" ao lado de "sustentam a tese" seria lido exatamente como previsão.
 */
const CLASSIFICACAO = {
  TENDENCIA_FAVORAVEL: { rotulo: "Tendência favorável", forma: "●", tom: "procedente" },
  TENDENCIA_CONTRARIA: { rotulo: "Tendência contrária", forma: "■", tom: "improcedente" },
  JURISPRUDENCIA_DIVIDIDA: { rotulo: "Jurisprudência dividida", forma: "◆", tom: "parcial" },
  INDETERMINADA: { rotulo: "Indeterminada", forma: "○", tom: "neutro" },
} as const;

const CONVERGENCIA: Record<string, string> = {
  ALTA: "Alta",
  MODERADA: "Moderada",
  DIVIDIDA: "Dividida",
  AMOSTRA_INSUFICIENTE: "Amostra insuficiente",
};

const ABAS = [
  { id: "precedentes", rotulo: "Precedentes" },
  { id: "questoes", rotulo: "Questões" },
  { id: "relatores", rotulo: "Relatores" },
] as const;

type AbaId = (typeof ABAS)[number]["id"];

function dataBr(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : iso;
}

function baixarCsv(painel: RelatorioDashboard, nome: string) {
  const blob = new Blob([precedentesParaCsv(painel)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function PainelRelatorio({ demo }: { demo: FinalReport }) {
  const [aba, setAba] = useState<AbaId>("precedentes");
  const [busca, setBusca] = useState("");
  const [posicao, setPosicao] = useState("Todas");
  const [camaraFiltro, setCamaraFiltro] = useState("Todas");

  // O relatório guardado vive no `sessionStorage`, que só existe no cliente. `useSyncExternalStore`
  // é o que o React oferece para ler uma origem externa sem divergir do HTML do servidor: o
  // snapshot do servidor é sempre `null`, e a hidratação substitui pelo que a aba tiver.
  const guardado = useSyncExternalStore(assinarRelatorio, snapshotRelatorio, snapshotNoServidor);

  const report = guardado?.report ?? demo;
  const ehDemonstracao = guardado === null;
  const painel = useMemo(() => buildRelatorioDashboard(report), [report]);

  const camarasDisponiveis = useMemo(
    () => ["Todas", ...painel.porCamara.map((item) => item.chave)],
    [painel.porCamara],
  );

  const precedentesFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return painel.precedentes.filter((linha) => {
      if (posicao === "Sustentam" && linha.posicao !== "SUSTENTA") return false;
      if (posicao === "Contrariam" && linha.posicao !== "CONTRARIA") return false;
      if (camaraFiltro !== "Todas" && linha.chamber !== camaraFiltro) return false;
      if (!termo) return true;
      return (
        linha.processNumber.toLowerCase().includes(termo) ||
        linha.judge.toLowerCase().includes(termo) ||
        linha.chamber.toLowerCase().includes(termo) ||
        linha.questao.toLowerCase().includes(termo) ||
        linha.citacao.toLowerCase().includes(termo)
      );
    });
  }, [painel.precedentes, busca, posicao, camaraFiltro]);

  const semPrecedentes = painel.precedentes.length === 0;

  return (
    <>
      <Grafismo className="pt-8 pb-20">
        <Envelope>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Link
              href="/envio"
              className="text-apoio font-semibold text-vn-verde-400 hover:text-vn-verde-300"
            >
              ← Nova pesquisa
            </Link>
            <Botao
              variante="clara"
              onClick={() => baixarCsv(painel, `precedentes-${painel.reportId.slice(0, 8)}.csv`)}
              disabled={semPrecedentes}
              title={
                semPrecedentes
                  ? "Não há precedentes para exportar"
                  : "Baixar a tabela de precedentes em CSV"
              }
            >
              Exportar precedentes (CSV)
            </Botao>
          </div>

          <h1 className="mt-8 text-titulo font-bold tracking-[-0.01em] text-vn-creme">
            Relatório de jurisprudência
          </h1>
          <p className="mt-2 text-apoio text-vn-navy-200">
            Triagem de pesquisa, não parecer. Todo número abaixo é contagem sobre a amostra
            analisada.
          </p>

          <div className="mt-10 grid grid-cols-2 gap-8 lg:grid-cols-4">
            <Kpi
              sobreNavy
              valor={painel.amostra.decisoesAnalisadas}
              rotulo="Decisões analisadas"
              apoio={`${painel.amostra.questoes} questão(ões) jurídica(s)`}
            />
            {/*
              "Conferidas" (6) e "listadas" (3) divergem de propósito e a diferença é informação, não
              erro de conta: uma citação verificada pode sustentar um RISCO ou um ARGUMENTO — que
              aparecem na aba Questões — em vez de virar linha de precedente. Rotular as duas como
              "citações" faria o usuário procurar três linhas que nunca existiram.
            */}
            <Kpi
              sobreNavy
              valor={painel.amostra.citacoesConferidas}
              rotulo="Citações conferidas"
              apoio="reabertas e batidas na fonte"
            />
            <Kpi
              sobreNavy
              valor={painel.posicao.total}
              rotulo="Precedentes listados"
              apoio={`${painel.amostra.decisoesCitadas} decisão(ões) distinta(s)`}
            />
            <Kpi
              sobreNavy
              valor={`${painel.amostra.camaras}/${painel.amostra.relatores}`}
              rotulo="Câmaras / relatores"
              apoio={
                painel.periodo.maisAntiga && painel.periodo.maisRecente
                  ? `${dataBr(painel.periodo.maisAntiga)} a ${dataBr(painel.periodo.maisRecente)}`
                  : "sem período apurado"
              }
            />
          </div>
        </Envelope>
      </Grafismo>

      <Envelope className="pb-24">
        {/* De onde vieram estes números — nunca implícito. */}
        <Cartao
          className={`relative z-10 -mt-10 border-l-[3px] p-6 ${
            ehDemonstracao ? "border-l-vn-info" : "border-l-vn-acao"
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="mb-2 text-apoio font-bold">
                {ehDemonstracao ? "Relatório de demonstração" : "Relatório da sua análise"}
              </h2>
              <p className="max-w-leitura text-rotulo leading-relaxed text-vn-texto-suave">
                {ehDemonstracao ? (
                  <>
                    Nenhuma análise foi feita nesta aba ainda, então o painel está lendo o relatório
                    de demonstração — que também é real: sai do pipeline completo sobre a
                    jurisprudência fictícia versionada.{" "}
                    <Link href="/envio" className="font-semibold">
                      Envie uma peça
                    </Link>{" "}
                    para ver o seu caso aqui.
                  </>
                ) : (
                  <>
                    Gerado a partir de{" "}
                    <strong className="font-semibold text-vn-texto">{guardado?.fileName}</strong>.
                    Execução <span className="num">{guardado?.runId.slice(0, 8)}</span>. Os dados
                    ficam nesta aba e são descartados ao fechá-la.
                  </>
                )}
              </p>
            </div>
            {painel.caso.processNumber && (
              <div className="text-right">
                <Rotulo>Processo</Rotulo>
                <div className="num mt-1 text-apoio font-semibold">{painel.caso.processNumber}</div>
                {painel.caso.chamber && (
                  <div className="text-legenda text-vn-texto-suave">{painel.caso.chamber}</div>
                )}
              </div>
            )}
          </div>
        </Cartao>

        {semPrecedentes ? (
          <SemPrecedentes painel={painel} />
        ) : (
          <Secao titulo="Distribuição dos achados">
            <div className="grid gap-6 lg:grid-cols-3">
              <Cartao className="p-6">
                <Rotulo className="mb-5">Posição em relação à tese</Rotulo>
                <div className="flex flex-col gap-4">
                  <Barra
                    rotulo="Sustentam"
                    valor={painel.posicao.sustentam}
                    total={painel.posicao.total}
                  />
                  <Barra
                    rotulo="Contrariam"
                    valor={painel.posicao.contrariam}
                    total={painel.posicao.total}
                  />
                </div>
                <p className="mt-5 border-t border-vn-borda pt-4 text-legenda leading-relaxed text-vn-texto-suave">
                  Contagem de citações verificadas, não previsão de resultado.
                </p>
              </Cartao>

              <Cartao className="p-6">
                <Rotulo className="mb-5">Por câmara</Rotulo>
                <div className="flex flex-col gap-4">
                  {painel.porCamara.map((item) => (
                    <Barra
                      key={item.chave}
                      rotulo={item.chave}
                      valor={item.total}
                      total={painel.posicao.total}
                    />
                  ))}
                </div>
              </Cartao>

              <Cartao className="p-6">
                <Rotulo className="mb-5">Por ano de julgamento</Rotulo>
                <div className="flex flex-col gap-4">
                  {painel.porAno.map((item) => (
                    <Barra
                      key={item.ano}
                      rotulo={item.ano}
                      valor={item.total}
                      total={painel.posicao.total}
                    />
                  ))}
                </div>
              </Cartao>
            </div>
          </Secao>
        )}

        <Secao titulo="Detalhamento">
          <Cartao className="overflow-hidden">
            {aba === "precedentes" && !semPrecedentes && (
              <div className="grid gap-4 border-b border-vn-borda p-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
                <div>
                  <RotuloCampo htmlFor="rel-busca">Buscar no relatório</RotuloCampo>
                  <Campo
                    id="rel-busca"
                    type="search"
                    value={busca}
                    onChange={(event) => setBusca(event.target.value)}
                    placeholder="Processo, relator, câmara ou trecho"
                  />
                </div>
                <div>
                  <RotuloCampo htmlFor="rel-posicao">Posição</RotuloCampo>
                  <Selecao
                    id="rel-posicao"
                    value={posicao}
                    onChange={(event) => setPosicao(event.target.value)}
                  >
                    <option>Todas</option>
                    <option>Sustentam</option>
                    <option>Contrariam</option>
                  </Selecao>
                </div>
                <div>
                  <RotuloCampo htmlFor="rel-camara">Câmara</RotuloCampo>
                  <Selecao
                    id="rel-camara"
                    value={camaraFiltro}
                    onChange={(event) => setCamaraFiltro(event.target.value)}
                  >
                    {camarasDisponiveis.map((camara) => (
                      <option key={camara}>{camara}</option>
                    ))}
                  </Selecao>
                </div>
              </div>
            )}

            <Abas abas={ABAS} ativa={aba} onMudar={setAba} className="px-6" />

            {aba === "precedentes" && (
              <div role="tabpanel" id="painel-precedentes" aria-labelledby="aba-precedentes">
                <TabelaPrecedentes linhas={precedentesFiltrados} />
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-vn-borda px-6 py-4">
                  <span className="num text-rotulo text-vn-texto-suave">
                    Mostrando {precedentesFiltrados.length} de {painel.precedentes.length}{" "}
                    precedente(s)
                    {painel.amostra.citacoesConferidas > painel.precedentes.length && (
                      <span className="text-vn-texto-suave">
                        {" · as outras "}
                        {painel.amostra.citacoesConferidas - painel.precedentes.length}
                        {" citações conferidas sustentam riscos e argumentos, em Questões"}
                      </span>
                    )}
                  </span>
                  <Botao
                    variante="texto"
                    onClick={() =>
                      baixarCsv(painel, `precedentes-${painel.reportId.slice(0, 8)}.csv`)
                    }
                    disabled={semPrecedentes}
                  >
                    Exportar CSV
                  </Botao>
                </div>
              </div>
            )}

            {aba === "questoes" && (
              <div
                role="tabpanel"
                id="painel-questoes"
                aria-labelledby="aba-questoes"
                className="divide-y divide-vn-borda"
              >
                {painel.questoes.map((questao) => {
                  const classe = CLASSIFICACAO[questao.classificacao];
                  return (
                    <div key={questao.legalIssueId} className="p-6">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-sub font-semibold">{questao.topico}</h3>
                          <p className="mt-1 max-w-leitura text-apoio text-vn-texto-suave">
                            {questao.pergunta}
                          </p>
                        </div>
                        {/* forma + rótulo: cor nunca carrega o significado sozinha */}
                        <Marcador tom={classe.tom}>
                          <span aria-hidden="true">{classe.forma}</span> {classe.rotulo}
                        </Marcador>
                      </div>

                      <p className="mt-3 max-w-leitura text-apoio leading-relaxed text-vn-texto">
                        {questao.resumoTendencia}
                      </p>
                      <p className="mt-1 text-legenda text-vn-texto-suave">
                        Leitura: {CONVERGENCIA[questao.convergencia] ?? questao.convergencia} ·{" "}
                        {questao.motivoClassificacao}
                      </p>

                      <div className="num mt-4 flex flex-wrap gap-x-6 gap-y-2 text-rotulo">
                        <span>
                          <strong className="font-bold">{questao.analisadas}</strong> analisadas
                        </span>
                        <span>
                          <strong className="font-bold">{questao.sustentam}</strong> sustentam
                        </span>
                        <span>
                          <strong className="font-bold">{questao.contrariam}</strong> contrariam
                        </span>
                        <span>
                          <strong className="font-bold">{questao.mistas}</strong> mistas
                        </span>
                        <span className="text-vn-texto-suave">
                          {questao.riscos} risco(s) · {questao.argumentos} argumento(s)
                        </span>
                      </div>

                      {questao.padraoDaCamara && (
                        <p className="mt-3 max-w-leitura border-l-[3px] border-l-vn-borda pl-4 text-legenda leading-relaxed text-vn-texto-suave">
                          {questao.padraoDaCamara}
                        </p>
                      )}
                      {questao.avisoSemContrarios && (
                        <p className="mt-3 text-legenda text-vn-texto-suave">
                          {questao.avisoSemContrarios}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {aba === "relatores" && (
              <div role="tabpanel" id="painel-relatores" aria-labelledby="aba-relatores">
                <Rolagem>
                  <Tabela>
                    <Thead>
                      <Th>Relator</Th>
                      <Th>Citações</Th>
                      <Th>Sustentam</Th>
                      <Th>Contrariam</Th>
                    </Thead>
                    <Tbody>
                      {painel.porRelator.map((item) => (
                        <tr key={item.chave}>
                          <Td className="font-medium">{item.chave}</Td>
                          <Td className="num">{item.total}</Td>
                          {/* contagem, nunca "tendência do relator": o produto não prevê voto */}
                          <Td className="num">
                            {item.sustentam}
                            <span className="text-vn-texto-suave"> de {item.total}</span>
                          </Td>
                          <Td className="num">{item.contrariam}</Td>
                        </tr>
                      ))}
                      {painel.porRelator.length === 0 && (
                        <tr>
                          <Td colSpan={4} className="text-center text-vn-texto-suave">
                            Nenhuma citação verificada nesta amostra.
                          </Td>
                        </tr>
                      )}
                    </Tbody>
                  </Tabela>
                </Rolagem>
              </div>
            )}
          </Cartao>
        </Secao>

        {painel.omissoes.length > 0 && (
          <Secao
            titulo="O que ficou de fora"
            descricao="Itens bloqueados individualmente por falta de verificação ou de proveniência (HU-27). O relatório inteiro nunca cai junto."
          >
            <Cartao className="divide-y divide-vn-borda">
              {painel.omissoes.map((omissao, indice) => (
                <div key={`${omissao.subject}-${indice}`} className="p-5">
                  <Marcador tom="atencao">{omissao.kind}</Marcador>
                  <p className="mt-2 text-apoio text-vn-texto">{omissao.subject}</p>
                  <p className="mt-1 text-legenda text-vn-texto-suave">{omissao.reason}</p>
                </div>
              ))}
            </Cartao>
          </Secao>
        )}
      </Envelope>
    </>
  );
}

/**
 * Amostra analisada sem nenhuma citação aproveitável.
 *
 * Isto NÃO é um estado de erro, e tratá-lo como tabela vazia seria perder a informação: as decisões
 * foram lidas e nenhuma respondeu às questões deste caso. Para quem decide se entra com a ação, "a
 * jurisprudência disponível não fala sobre isso" é resultado, não ausência de resultado.
 */
function SemPrecedentes({ painel }: { painel: RelatorioDashboard }) {
  return (
    <Secao titulo="Nenhuma citação verificada nesta amostra">
      <Cartao className="border-l-[3px] border-l-vn-atencao p-6">
        <p className="max-w-leitura text-apoio leading-relaxed text-vn-texto">
          As <span className="num font-semibold">{painel.amostra.decisoesAnalisadas}</span> decisões
          analisadas foram lidas, mas nenhuma produziu trecho que sustentasse ou contrariasse as{" "}
          <span className="num font-semibold">{painel.amostra.questoes}</span> questões deste caso
          com citação conferida na fonte.
        </p>
        <p className="mt-3 max-w-leitura text-rotulo leading-relaxed text-vn-texto-suave">
          Isso costuma significar que o acervo consultado não trata da matéria da peça — e não que a
          tese seja fraca. A regra que produz este resultado é a mesma que impede citação inventada:
          o relatório só apresenta o que conseguiu reabrir e conferir na decisão original.
        </p>
        <p className="mt-4 text-legenda text-vn-texto-suave">
          Veja em <strong className="font-semibold text-vn-texto">Questões</strong>, abaixo, o motivo
          registrado para cada uma.
        </p>
      </Cartao>
    </Secao>
  );
}

function TabelaPrecedentes({ linhas }: { linhas: PrecedenteLinha[] }) {
  return (
    <Rolagem>
      <Tabela>
        <Thead>
          <Th>Acórdão</Th>
          <Th>Câmara</Th>
          <Th>Relator</Th>
          <Th>Julgamento</Th>
          <Th>Posição</Th>
          <Th>Questão</Th>
          <Th>Fonte</Th>
        </Thead>
        <Tbody>
          {linhas.map((linha) => (
            <tr key={linha.evidenceId}>
              <Td className="num font-medium whitespace-nowrap">{linha.processNumber}</Td>
              <Td className="whitespace-nowrap">{linha.chamber}</Td>
              <Td className="whitespace-nowrap">{linha.judge}</Td>
              <Td className="num whitespace-nowrap">{dataBr(linha.judgmentDate)}</Td>
              <Td>
                <Marcador tom={linha.posicao === "SUSTENTA" ? "procedente" : "improcedente"}>
                  {linha.posicao === "SUSTENTA" ? "Sustenta" : "Contraria"}
                </Marcador>
              </Td>
              <Td className="max-w-[22ch]">{linha.questao}</Td>
              <Td className="whitespace-nowrap">
                {/* provenance já está nas colunas ao lado: o link não é a única forma de conferir */}
                <a href={linha.url} target="_blank" rel="noreferrer noopener" className="font-semibold">
                  Inteiro teor →
                </a>
              </Td>
            </tr>
          ))}
          {linhas.length === 0 && (
            <tr>
              <Td colSpan={7} className="text-center text-vn-texto-suave">
                Nenhuma citação corresponde a esse recorte.
              </Td>
            </tr>
          )}
        </Tbody>
      </Tabela>
    </Rolagem>
  );
}
