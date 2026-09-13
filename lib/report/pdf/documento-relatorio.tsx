import { Document, Link, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { FinalReport, ReportClaim, ReportPrecedentItem, ReportSource } from "../../schemas/report.schema";
import { buildRelatorioDashboard, type RelatorioDashboard } from "../report-dashboard";
import { textoIndicador, type Indicador } from "../indicadores";
import { TRIBUNAL_PESQUISADO } from "../../config/official-sources";

/**
 * O relatório como PDF nativo.
 *
 * **Por que não é a tela impressa.** `window.print()` delega o formato de saída ao driver de
 * impressão do usuário: o PDF que o QA gerou saiu com zero caracteres extraíveis e zero anotações
 * de link — 825 KB de imagem para 4 páginas. Nenhuma folha de estilo alcança isso. Aqui o texto é
 * texto, o link é anotação de verdade, e a paginação é decidida por este arquivo.
 *
 * **A fonte dos números é o `FinalReport` persistido**, nunca HTML nem texto copiado da interface.
 * O mesmo `buildRelatorioDashboard` que alimenta a tela alimenta este documento — é o que impede
 * tela e PDF de mostrarem contagens diferentes do mesmo relatório.
 *
 * **Links**: o texto visível é curto ("Abrir decisão no TJPR") e carrega a anotação clicável; a URL
 * completa vai numa linha secundária, menor. Assim o PDF funciona nas duas leituras — na tela se
 * clica, no papel se digita — sem que uma URL de 120 caracteres arrebente o layout.
 */

const COR = {
  navy: "#10243D",
  navySuave: "#49586E",
  verde: "#0D7351",
  borda: "#E5E1D6",
  fundoSuave: "#F9F8F4",
  critico: "#B4341F",
} as const;

const s = StyleSheet.create({
  /**
   * ATENÇÃO: `lineHeight` NÃO pode viver aqui.
   *
   * Com `lineHeight` no estilo da `Page`, o @react-pdf/renderer 4.9 simplesmente não emite os
   * blocos `fixed` de rodapé — some a numeração e o aviso de toda página, sem erro nenhum. Levou
   * uma bissecção para achar; `color` e a posição do rodapé não têm esse efeito. Fica no
   * `conteudo`, um nível abaixo, onde produz o mesmo resultado visual.
   */
  pagina: {
    paddingTop: 64,
    paddingBottom: 56,
    paddingHorizontal: 48,
    fontSize: 9.5,
    color: COR.navy,
  },
  conteudo: { lineHeight: 1.5 },
  cabecalhoFixo: {
    position: "absolute",
    top: 28,
    left: 48,
    right: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: COR.borda,
    paddingBottom: 6,
    fontSize: 8,
    color: COR.navySuave,
  },
  rodapeFixo: {
    position: "absolute",
    bottom: 26,
    left: 48,
    right: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: COR.borda,
    paddingTop: 6,
    fontSize: 8,
    color: COR.navySuave,
  },

  capaMarca: { fontSize: 22, fontWeight: "bold", color: COR.navy },
  capaRegua: { width: 56, height: 3, backgroundColor: COR.verde, marginVertical: 12 },
  capaTitulo: { fontSize: 16, fontWeight: "bold", marginBottom: 6 },
  capaLinha: { fontSize: 9.5, color: COR.navySuave, marginBottom: 2 },

  secao: { marginTop: 18 },
  secaoTitulo: {
    fontSize: 12,
    fontWeight: "bold",
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: COR.borda,
  },
  subtitulo: { fontSize: 10.5, fontWeight: "bold", marginTop: 10, marginBottom: 4 },
  rotulo: { fontSize: 7.5, color: COR.navySuave, letterSpacing: 0.6, textTransform: "uppercase" },
  suave: { color: COR.navySuave },
  paragrafo: { marginBottom: 4 },

  kpiFaixa: { flexDirection: "row", gap: 10, marginBottom: 8 },
  kpi: { flex: 1, borderWidth: 1, borderColor: COR.borda, padding: 8 },
  kpiValor: { fontSize: 15, fontWeight: "bold" },

  cartao: { borderWidth: 1, borderColor: COR.borda, padding: 8, marginBottom: 6 },
  citacao: {
    borderLeftWidth: 2,
    borderLeftColor: COR.navySuave,
    paddingLeft: 6,
    marginVertical: 3,
    color: COR.navySuave,
  },
  link: { color: COR.verde, textDecoration: "underline" },
  urlLonga: { fontSize: 7, color: COR.navySuave },

  linhaTabela: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COR.borda,
    paddingVertical: 4,
  },
  cabecalhoTabela: {
    flexDirection: "row",
    backgroundColor: COR.navy,
    color: "#FFFFFF",
    paddingVertical: 5,
    paddingHorizontal: 2,
    fontSize: 7.5,
    fontWeight: "bold",
  },
  aviso: {
    borderLeftWidth: 3,
    borderLeftColor: COR.verde,
    backgroundColor: COR.fundoSuave,
    padding: 8,
    marginTop: 12,
  },
  avisoAtencao: { borderLeftColor: COR.critico },
});

export interface DadosRelatorioPdf {
  report: FinalReport;
  fileName: string;
  runId: string;
  /**
   * Recorte aplicado na busca. Opcional porque HOJE ele não é persistido junto da execução — o
   * `FinalReport` não carrega os termos nem os filtros usados. Quando ausente, o PDF diz que não
   * foi registrado, em vez de omitir a seção: um relatório que não sabe dizer o que pesquisou é
   * menos auditável, e esconder isso é pior do que admitir.
   */
  escopo?: { termos?: string[]; camara?: string; periodo?: string };
}

function dataBr(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short" });
}

function dataCurta(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** Linha de indicador: o texto já vem com denominador obrigatório de `textoIndicador`. */
function LinhaIndicador({ rotulo, indicador }: { rotulo: string; indicador: Indicador }) {
  return (
    <View style={{ marginBottom: 3 }}>
      <Text>
        <Text style={{ fontWeight: "bold" }}>{rotulo}: </Text>
        {textoIndicador(indicador)}
      </Text>
      {indicador.exibir && indicador.aviso ? (
        <Text style={[s.suave, { fontSize: 7.5 }]}>{indicador.aviso}</Text>
      ) : null}
    </View>
  );
}

/**
 * Proveniência de um achado (HU-27 / I-14).
 *
 * Fonte ausente não é omitida em silêncio: fica marcada no próprio precedente, porque um achado sem
 * origem conferível precisa ser visivelmente diferente de um que tem.
 */
function Fonte({ source }: { source: ReportSource }) {
  const temUrl = typeof source.url === "string" && /^https?:\/\//.test(source.url);

  return (
    <View style={{ marginTop: 3 }}>
      <Text style={[s.suave, { fontSize: 8 }]}>
        {source.processNumber} · {source.chamber} · {source.judge} · {dataCurta(source.judgmentDate)}
      </Text>
      {temUrl ? (
        <>
          <Link src={source.url} style={[s.link, { fontSize: 8 }]}>
            Abrir decisão no {TRIBUNAL_PESQUISADO}
          </Link>
          {/* A URL por extenso existe para quem lê no papel e precisa digitar. */}
          <Text style={s.urlLonga}>{source.url}</Text>
        </>
      ) : (
        <Text style={[{ fontSize: 8, color: COR.critico }]}>
          Sem link oficial verificável para esta decisão.
        </Text>
      )}
    </View>
  );
}

function Precedentes({ titulo, itens, aviso }: { titulo: string; itens: ReportPrecedentItem[]; aviso?: string }) {
  return (
    <View style={s.secao} wrap>
      <Text style={s.subtitulo}>{titulo}</Text>
      {itens.length === 0 ? (
        // HU-22: a seção nunca some — a ausência é declarada.
        <Text style={s.suave}>{aviso ?? "Nenhum item nesta categoria."}</Text>
      ) : (
        itens.map((item) => (
          // `wrap={false}`: um precedente separado da citação que o sustenta perde o sentido.
          <View key={item.evidenceId} style={s.cartao} wrap={false}>
            <Text style={{ fontWeight: "bold" }}>{item.argument}</Text>
            <Text style={s.citacao}>“{item.quote}”</Text>
            <Text style={[s.suave, { fontSize: 8 }]}>{item.context}</Text>
            <Fonte source={item.source} />
          </View>
        ))
      )}
    </View>
  );
}

function Alegacoes({ titulo, itens }: { titulo: string; itens: ReportClaim[] }) {
  if (itens.length === 0) return null;
  return (
    <View style={s.secao}>
      <Text style={s.subtitulo}>{titulo}</Text>
      {itens.map((claim, i) => (
        <View key={`${titulo}-${i}`} style={s.cartao} wrap={false}>
          <Text>{claim.statement}</Text>
          {claim.sources.map((source, j) => (
            <Fonte key={`${i}-${j}`} source={source} />
          ))}
        </View>
      ))}
    </View>
  );
}

function TabelaPrecedentes({ painel }: { painel: RelatorioDashboard }) {
  const colunas = [
    { titulo: "Acórdão", largura: 1.5 },
    { titulo: "Câmara", largura: 1 },
    { titulo: "Relator", largura: 1.2 },
    { titulo: "Julgamento", largura: 0.8 },
    { titulo: "Posição", largura: 0.7 },
  ];

  return (
    <View style={s.secao}>
      <Text style={s.secaoTitulo}>Precedentes citados</Text>
      {painel.precedentes.length === 0 ? (
        <Text style={s.suave}>
          Nenhuma citação verificada nesta amostra. As {painel.amostra.decisoesAnalisadas} decisões
          analisadas foram lidas e nenhuma produziu trecho conferível para as questões deste caso.
        </Text>
      ) : (
        <View>
          {/* `fixed`: cabeçalho repetido quando a tabela atravessa páginas. */}
          <View style={s.cabecalhoTabela} fixed>
            {colunas.map((c) => (
              <Text key={c.titulo} style={{ flex: c.largura, paddingHorizontal: 3 }}>
                {c.titulo}
              </Text>
            ))}
          </View>
          {painel.precedentes.map((linha) => (
            <View key={linha.evidenceId} style={s.linhaTabela} wrap={false}>
              <Text style={{ flex: 1.5, paddingHorizontal: 3, fontSize: 8 }}>{linha.processNumber}</Text>
              <Text style={{ flex: 1, paddingHorizontal: 3, fontSize: 8 }}>{linha.chamber}</Text>
              <Text style={{ flex: 1.2, paddingHorizontal: 3, fontSize: 8 }}>{linha.judge}</Text>
              <Text style={{ flex: 0.8, paddingHorizontal: 3, fontSize: 8 }}>
                {dataCurta(linha.judgmentDate)}
              </Text>
              <Text style={{ flex: 0.7, paddingHorizontal: 3, fontSize: 8 }}>
                {linha.posicao === "SUSTENTA" ? "Sustenta" : "Contraria"}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * Relatores (I-12).
 *
 * Só contagem: nenhum rótulo valorativo, nenhuma leitura de tendência por magistrado. O aviso de
 * base amostral fica **nesta mesma View**, com `wrap={false}`, para não ser separado da tabela que
 * ele qualifica — um aviso que cai sozinho na página seguinte não avisa ninguém.
 */
function Relatores({ painel }: { painel: RelatorioDashboard }) {
  if (painel.porRelator.length === 0) return null;

  return (
    <View style={s.secao} wrap={false}>
      <Text style={s.secaoTitulo}>Relatores na amostra</Text>
      <View style={s.cabecalhoTabela} >
        <Text style={{ flex: 2, paddingHorizontal: 3 }}>Relator</Text>
        <Text style={{ flex: 1, paddingHorizontal: 3 }}>Citações</Text>
        <Text style={{ flex: 2, paddingHorizontal: 3 }}>Sustentam</Text>
      </View>
      {painel.porRelator.map((item) => (
        <View key={item.chave} style={s.linhaTabela}>
          <Text style={{ flex: 2, paddingHorizontal: 3, fontSize: 8 }}>{item.chave}</Text>
          <Text style={{ flex: 1, paddingHorizontal: 3, fontSize: 8 }}>{item.total}</Text>
          <Text style={{ flex: 2, paddingHorizontal: 3, fontSize: 8 }}>
            {textoIndicador(item.indicador, "citações deste relator")}
          </Text>
        </View>
      ))}
      <Text style={[s.suave, { fontSize: 7.5, marginTop: 6 }]}>
        Contagem sobre a amostra analisada. Não é previsão sobre decisões futuras de nenhum
        magistrado.
      </Text>
    </View>
  );
}

export function DocumentoRelatorio({ report, fileName, runId, escopo }: DadosRelatorioPdf) {
  const painel = buildRelatorioDashboard(report);

  return (
    <Document
      title={`Relatório de jurisprudência — ${fileName}`}
      author="Data VênIA"
      subject="Pesquisa de jurisprudência"
      creator="Data VênIA"
      producer="Data VênIA"
    >
      <Page size="A4" style={s.pagina}>
        <View style={s.cabecalhoFixo} fixed>
          <Text>Data VênIA · Relatório de pesquisa jurisprudencial</Text>
          <Text>{painel.reportId.slice(0, 8)}</Text>
        </View>
        <View style={s.rodapeFixo} fixed>
          <Text>Triagem de pesquisa — não é parecer jurídico.</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>

        <View style={s.conteudo}>
        {/* ---------------------------------------------------------- capa */}
        <View>
          <Text style={s.capaMarca}>Data VênIA</Text>
          <View style={s.capaRegua} />
          <Text style={s.capaTitulo}>Relatório de pesquisa jurisprudencial</Text>
          <Text style={s.capaLinha}>Peça analisada: {fileName}</Text>
          <Text style={s.capaLinha}>Execução: {runId}</Text>
          <Text style={s.capaLinha}>Relatório: {report.reportId}</Text>
          <Text style={s.capaLinha}>
            Gerado em {dataBr(report.generatedAt)} · schema {report.schemaVersion}
          </Text>
          <Text style={s.capaLinha}>
            Jurisprudência pesquisada: {TRIBUNAL_PESQUISADO}
            {painel.caso.deOutroTribunal === true && painel.caso.court
              ? ` · a peça é do ${painel.caso.court}`
              : ""}
          </Text>
        </View>

        {/* ------------------------------------------------- resumo e escopo */}
        <View style={s.secao}>
          <Text style={s.secaoTitulo}>Resumo do caso</Text>
          {painel.caso.processNumber ? (
            <Text style={s.paragrafo}>Processo: {painel.caso.processNumber}</Text>
          ) : null}
          {painel.caso.chamber ? (
            <Text style={s.paragrafo}>Órgão julgador: {painel.caso.chamber}</Text>
          ) : null}

          <Text style={s.subtitulo}>Pedidos</Text>
          {report.caseSummary.requests.map((p, i) => (
            <Text key={`ped-${i}`} style={s.paragrafo}>
              • {p}
            </Text>
          ))}

          <Text style={s.subtitulo}>Escopo aplicado na busca</Text>
          {escopo?.termos?.length || escopo?.camara || escopo?.periodo ? (
            <>
              {escopo.termos?.length ? (
                <Text style={s.paragrafo}>Termos: {escopo.termos.join(" · ")}</Text>
              ) : null}
              {escopo.camara ? <Text style={s.paragrafo}>Câmara: {escopo.camara}</Text> : null}
              {escopo.periodo ? <Text style={s.paragrafo}>Período: {escopo.periodo}</Text> : null}
            </>
          ) : (
            <Text style={s.suave}>
              Não registrado nesta execução: o escopo da busca ainda não é persistido junto do
              relatório.
            </Text>
          )}
        </View>

        {/* ------------------------------------------------------------ KPIs */}
        <View style={s.secao} wrap={false}>
          <Text style={s.secaoTitulo}>Base amostral</Text>
          <View style={s.kpiFaixa}>
            {[
              { v: painel.amostra.decisoesAnalisadas, r: "Decisões analisadas" },
              { v: painel.amostra.citacoesConferidas, r: "Citações conferidas" },
              { v: painel.posicao.total, r: "Precedentes listados" },
              { v: `${painel.amostra.camaras}/${painel.amostra.relatores}`, r: "Câmaras/relatores" },
            ].map((k) => (
              <View key={k.r} style={s.kpi}>
                <Text style={s.kpiValor}>{k.v}</Text>
                <Text style={s.rotulo}>{k.r}</Text>
              </View>
            ))}
          </View>
          <LinhaIndicador rotulo="Precedentes que sustentam a tese" indicador={painel.posicao.indicador} />
          {painel.periodo.maisAntiga && painel.periodo.maisRecente ? (
            <Text style={s.suave}>
              Período coberto: {dataCurta(painel.periodo.maisAntiga)} a{" "}
              {dataCurta(painel.periodo.maisRecente)}.
            </Text>
          ) : null}
        </View>

        {/* -------------------------------------------- questões jurídicas */}
        <View style={s.secao}>
          <Text style={s.secaoTitulo}>Questões jurídicas analisadas</Text>
        </View>
        {painel.questoes.map((questao) => {
          const issue = report.issues.find((i) => i.legalIssueId === questao.legalIssueId);
          return (
            <View key={questao.legalIssueId} style={s.secao}>
              <Text style={s.subtitulo}>{questao.topico}</Text>
              <Text style={[s.suave, s.paragrafo]}>{questao.pergunta}</Text>
              <Text style={s.paragrafo}>{questao.resumoTendencia}</Text>
              <LinhaIndicador rotulo="Sustentam esta tese" indicador={questao.indicadorSustentam} />
              <Text style={[s.suave, { fontSize: 8 }]}>{questao.motivoClassificacao}</Text>

              {issue ? (
                <>
                  <Precedentes
                    titulo="Pontos favoráveis"
                    itens={issue.favorablePoints}
                    aviso="Nenhum ponto favorável verificado na amostra."
                  />
                  <Precedentes
                    titulo="Pontos contrários"
                    itens={issue.contraryPoints}
                    aviso={issue.contraryPointsNotice}
                  />
                  <Alegacoes titulo="Principais riscos" itens={issue.risks} />
                  <Alegacoes titulo="Estratégia argumentativa sugerida" itens={issue.suggestedArguments} />
                </>
              ) : null}
            </View>
          );
        })}

        <TabelaPrecedentes painel={painel} />
        <Relatores painel={painel} />

        {/* ------------------------------------------- rastreabilidade e aviso */}
        <View style={s.secao} wrap={false}>
          <Text style={s.secaoTitulo}>Rastreabilidade</Text>
          <Text style={s.paragrafo}>
            {painel.amostra.decisoesAnalisadas} decisão(ões) analisada(s) ·{" "}
            {painel.amostra.citacoesConferidas} citação(ões) reaberta(s) e conferida(s) na fonte ·{" "}
            {painel.amostra.itensOmitidos} item(ns) omitido(s).
          </Text>

          {painel.omissoes.length > 0 ? (
            <>
              <Text style={s.subtitulo}>O que ficou de fora e por quê</Text>
              {painel.omissoes.map((o, i) => (
                <Text key={`om-${i}`} style={[s.suave, { fontSize: 8, marginBottom: 2 }]}>
                  [{o.kind}] {o.subject} — {o.reason}
                </Text>
              ))}
            </>
          ) : null}

          {/* HU-28: o aviso é obrigatório e não dispensável. Num PDF, que circula longe da tela
              onde a ressalva estava, ele importa mais, não menos. */}
          <View style={[s.aviso, s.avisoAtencao]}>
            <Text style={{ fontWeight: "bold" }}>{report.disclaimer}</Text>
            <Text style={[s.suave, { marginTop: 3 }]}>
              A classificação é triagem de pesquisa jurisprudencial — não é parecer jurídico nem
              previsão de êxito processual. Os percentuais descrevem a amostra analisada, não
              probabilidade de resultado.
            </Text>
          </View>
        </View>
        </View>
      </Page>
    </Document>
  );
}
