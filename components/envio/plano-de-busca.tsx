"use client";

import { useMemo, useState } from "react";
import type { SearchPlan, SearchPlanProposal } from "@/lib/schemas/search-plan.schema";
import type { SearchQuery } from "@/lib/schemas/query-generation.schema";
import { Cartao } from "../ui/cartao";
import { Botao } from "../ui/botao";
import { Rotulo } from "../ui/rotulo";
import { Marcador } from "../ui/marcador";
import { Campo, Selecao, RotuloCampo } from "../ui/campo";
import { Regua } from "../ui/regua";

/**
 * Checkpoint humano entre a leitura da peça e a busca.
 *
 * O modelo propõe os termos a partir do documento (HU-11); quem conhece o caso é o advogado. Aqui
 * ele tira o termo que não serve, acrescenta o que o modelo não viu e define o recorte — e só então
 * a busca roda. Colocar essa revisão ANTES da busca não é conveniência: depois dela vêm o funil de
 * HU-13 e uma chamada de modelo por decisão, então um termo errado sai caro e demorado.
 *
 * `intent` é exibido porque não é rótulo decorativo: `CONTRARY` é o que alimenta HU-22 e impede
 * relatório de um lado só. Por isso a última pesquisa contrária não pode ser removida — o schema
 * recusaria o plano de qualquer forma (`SearchPlanSchema`), e falhar no envio depois de o usuário
 * ter montado tudo seria pior do que explicar agora.
 */
const INTENT_ROTULO: Record<SearchQuery["intent"], string> = {
  MAIN_THESIS: "Tese principal",
  CONTRARY: "Contrária",
  RELATED: "Correlata",
};

const INTENT_TOM: Record<SearchQuery["intent"], "procedente" | "atencao" | "parcial"> = {
  MAIN_THESIS: "procedente",
  CONTRARY: "atencao",
  RELATED: "parcial",
};

const CAMARAS = [
  { rotulo: "Todas as câmaras cíveis", valor: "" },
  { rotulo: "Turmas Recursais", valor: "Turmas Recursais" },
  { rotulo: "Câmaras criminais", valor: "Câmaras Criminais" },
] as const;

const PERIODOS = [
  { rotulo: "Últimos 5 anos", anos: 5 },
  { rotulo: "Últimos 3 anos", anos: 3 },
  { rotulo: "Últimos 12 meses", anos: 1 },
  { rotulo: "Todo o acervo", anos: 0 },
] as const;

function inicioDoPeriodo(anos: number): string | undefined {
  if (anos <= 0) return undefined;
  const data = new Date();
  data.setFullYear(data.getFullYear() - anos);
  return data.toISOString().slice(0, 10);
}

export function PlanoDeBusca({
  proposal,
  onConfirmar,
  onCancelar,
  ocupado = false,
}: {
  proposal: SearchPlanProposal;
  onConfirmar: (plan: SearchPlan) => void;
  onCancelar: () => void;
  ocupado?: boolean;
}) {
  const [queries, setQueries] = useState<SearchQuery[]>(proposal.queries);
  const [camara, setCamara] = useState<string>("");
  const [periodo, setPeriodo] = useState<number>(5);

  const [novoTermo, setNovoTermo] = useState("");
  const [novaIntencao, setNovaIntencao] = useState<SearchQuery["intent"]>("RELATED");
  const [novaQuestao, setNovaQuestao] = useState<string>(proposal.legalIssues[0]?.id ?? "");

  const contrarias = useMemo(
    () => queries.filter((item) => item.intent === "CONTRARY").length,
    [queries],
  );

  const questaoPorId = useMemo(
    () => new Map(proposal.legalIssues.map((issue) => [issue.id, issue])),
    [proposal.legalIssues],
  );

  function remover(indice: number) {
    setQueries((atuais) => atuais.filter((_, i) => i !== indice));
  }

  function adicionar() {
    const termo = novoTermo.trim();
    if (!termo || !novaQuestao) return;
    setQueries((atuais) => [
      ...atuais,
      {
        query: termo,
        reason: "Termo acrescentado pelo usuário na revisão do plano de busca.",
        intent: novaIntencao,
        legalIssueId: novaQuestao,
      },
    ]);
    setNovoTermo("");
  }

  const podeBuscar = queries.length > 0 && contrarias > 0 && !ocupado;

  return (
    <Cartao className="p-6">
      <Regua className="mb-5" />
      <h2 className="text-sub font-semibold">Revise o que vamos pesquisar</h2>
      <p className="mt-2 max-w-leitura text-apoio leading-relaxed text-vn-texto-suave">
        Estes são os termos que o sistema extraiu da sua peça. Remova o que não serve, acrescente o
        que faltou e defina o recorte — a busca no TJPR só roda depois que você confirmar.
      </p>

      <div className="mt-6 flex flex-col gap-5">
        {proposal.legalIssues.map((issue) => {
          const doTema = queries
            .map((query, indice) => ({ query, indice }))
            .filter(({ query }) => query.legalIssueId === issue.id);
          if (doTema.length === 0) return null;

          return (
            <div key={issue.id}>
              <Rotulo className="mb-1">{issue.topic}</Rotulo>
              <p className="mb-3 max-w-leitura text-legenda text-vn-texto-suave">{issue.question}</p>
              <ul className="flex flex-col gap-2">
                {doTema.map(({ query, indice }) => {
                  // A última contrária fica travada: sem ela o plano é recusado no envio.
                  const ultimaContraria = query.intent === "CONTRARY" && contrarias === 1;
                  return (
                    <li
                      key={`${query.query}-${indice}`}
                      className="flex flex-wrap items-center gap-3 border border-vn-borda bg-vn-papel-50 px-3 py-2.5"
                    >
                      <Marcador tom={INTENT_TOM[query.intent]}>{INTENT_ROTULO[query.intent]}</Marcador>
                      <span className="min-w-0 flex-1 text-apoio text-vn-texto">{query.query}</span>
                      <button
                        type="button"
                        onClick={() => remover(indice)}
                        disabled={ultimaContraria || ocupado}
                        title={
                          ultimaContraria
                            ? "É a única pesquisa por jurisprudência contrária. Sem ela o relatório sairia de um lado só (HU-11)."
                            : "Remover este termo"
                        }
                        className="cursor-pointer border-0 bg-transparent px-1 text-rotulo font-semibold text-vn-texto-suave transition-colors ease-vn hover:text-vn-critico disabled:cursor-not-allowed disabled:text-vn-navy-300 disabled:hover:text-vn-navy-300"
                      >
                        Remover
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      {/* acrescentar termo */}
      <div className="mt-6 border-t border-vn-borda pt-5">
        <Rotulo className="mb-3">Acrescentar termo</Rotulo>
        <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <div>
            <RotuloCampo htmlFor="plano-termo">Termo de busca</RotuloCampo>
            <Campo
              id="plano-termo"
              value={novoTermo}
              onChange={(event) => setNovoTermo(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  adicionar();
                }
              }}
              placeholder="ex.: prazo de reparo art. 18 CDC"
              disabled={ocupado}
            />
          </div>
          <div>
            <RotuloCampo htmlFor="plano-questao">Questão</RotuloCampo>
            <Selecao
              id="plano-questao"
              value={novaQuestao}
              onChange={(event) => setNovaQuestao(event.target.value)}
              disabled={ocupado}
            >
              {proposal.legalIssues.map((issue) => (
                <option key={issue.id} value={issue.id}>
                  {issue.topic}
                </option>
              ))}
            </Selecao>
          </div>
          <div>
            <RotuloCampo htmlFor="plano-intencao">Tipo</RotuloCampo>
            <Selecao
              id="plano-intencao"
              value={novaIntencao}
              onChange={(event) => setNovaIntencao(event.target.value as SearchQuery["intent"])}
              disabled={ocupado}
            >
              <option value="MAIN_THESIS">Tese principal</option>
              <option value="CONTRARY">Contrária</option>
              <option value="RELATED">Correlata</option>
            </Selecao>
          </div>
          <div className="flex items-end">
            <Botao
              type="button"
              variante="secundaria"
              onClick={adicionar}
              disabled={ocupado || novoTermo.trim().length === 0}
            >
              Acrescentar
            </Botao>
          </div>
        </div>
      </div>

      {/* recorte da busca */}
      <div className="mt-6 border-t border-vn-borda pt-5">
        <Rotulo className="mb-3">Recorte da busca</Rotulo>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <RotuloCampo htmlFor="plano-camara">Câmara</RotuloCampo>
            <Selecao
              id="plano-camara"
              value={camara}
              onChange={(event) => setCamara(event.target.value)}
              disabled={ocupado}
            >
              {CAMARAS.map((opcao) => (
                <option key={opcao.rotulo} value={opcao.valor}>
                  {opcao.rotulo}
                </option>
              ))}
            </Selecao>
          </div>
          <div>
            <RotuloCampo htmlFor="plano-periodo">Período</RotuloCampo>
            <Selecao
              id="plano-periodo"
              value={String(periodo)}
              onChange={(event) => setPeriodo(Number(event.target.value))}
              disabled={ocupado}
            >
              {PERIODOS.map((opcao) => (
                <option key={opcao.rotulo} value={opcao.anos}>
                  {opcao.rotulo}
                </option>
              ))}
            </Selecao>
          </div>
        </div>
      </div>

      {contrarias === 0 && (
        <p className="mt-5 border-l-[3px] border-l-vn-critico bg-vn-papel-50 p-4 text-rotulo leading-relaxed text-vn-texto">
          O plano precisa manter ao menos uma pesquisa por jurisprudência contrária. Sem ela a busca
          sairia de um lado só, e o relatório ainda afirmaria não ter encontrado precedente contrário
          — o que seria verdade sobre a busca, não sobre o acervo.
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-vn-borda pt-5">
        <Botao
          type="button"
          variante="primaria"
          disabled={!podeBuscar}
          onClick={() =>
            onConfirmar({
              queries,
              filters: {
                judgingBody: camara || undefined,
                periodStart: inicioDoPeriodo(periodo),
              },
            })
          }
        >
          {ocupado ? "Buscando…" : `Buscar ${queries.length} termo(s) no TJPR`}
        </Botao>
        <Botao type="button" variante="texto" onClick={onCancelar} disabled={ocupado}>
          Descartar e enviar outra peça
        </Botao>
      </div>
    </Cartao>
  );
}
