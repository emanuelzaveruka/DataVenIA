"use client";

import { useMemo, useState } from "react";
import { Abas } from "../ui/abas";
import { Cartao } from "../ui/cartao";
import { Campo, Selecao, RotuloCampo } from "../ui/campo";
import { Marcador } from "../ui/marcador";
import { Botao } from "../ui/botao";
import { Rolagem, Tabela, Thead, Tbody, Th, Td } from "../ui/tabela";

/**
 * Painel de precedentes do protótipo — abas, busca, filtros e paginação, tudo sobre dados fixos.
 *
 * DUAS TROCAS DELIBERADAS EM RELAÇÃO AO PROTÓTIPO, ambas por §3.10/HU-29:
 *
 * 1. A coluna "Aderência" não exibe percentual ("92%"). Aderência é o score interno do pré-ranking
 *    (`lib/services/jurisprudence/pre-rank.ts`), e expor score interno como número é exatamente o
 *    que §3.10 proíbe — ao lado de "Resultado: Procedente", "92%" lê como 92% de chance de ganhar.
 *    Vira rótulo qualitativo (Alta/Média/Baixa), na mesma lógica com que `ReportTrend.convergence`
 *    já sai como ALTA/MODERADA/DIVIDIDA em vez de número.
 * 2. O KPI "Favoráveis à tese" não sai em "66% dos aderentes" e sim em contagem absoluta, que é o
 *    que `trend.ts` produz ("6 de 10 decisões analisadas sustentam a tese").
 *
 * Quando este painel for ligado ao `FinalReport` real, a fonte de cada linha passa a ser
 * `ReportPrecedentItem` + `ReportSource` — que já têm processNumber/chamber/judge/judgmentDate/url
 * obrigatórios (HU-27). A forma da tabela abaixo foi desenhada para receber isso sem remodelar.
 */
type Aderencia = "Alta" | "Média" | "Baixa";

interface Precedente {
  acordao: string;
  camara: string;
  relator: string;
  julgamento: string;
  resultado: "Procedente" | "Parcial" | "Improcedente";
  aderencia: Aderencia;
}

const PRECEDENTES: Precedente[] = [
  { acordao: "0001234-56.2024.8.16.0004", camara: "9ª Cível", relator: "Des. A. Marques", julgamento: "18/03/2024", resultado: "Procedente", aderencia: "Alta" },
  { acordao: "0007781-09.2024.8.16.0014", camara: "17ª Cível", relator: "Desa. C. Ribeiro", julgamento: "05/02/2024", resultado: "Procedente", aderencia: "Alta" },
  { acordao: "0009876-11.2023.8.16.0019", camara: "17ª Cível", relator: "Des. R. Tavares", julgamento: "22/11/2023", resultado: "Parcial", aderencia: "Alta" },
  { acordao: "0003310-45.2023.8.16.0030", camara: "6ª Cível", relator: "Desa. M. Lopes", julgamento: "09/08/2023", resultado: "Parcial", aderencia: "Média" },
  { acordao: "0004455-02.2022.8.16.0001", camara: "6ª Cível", relator: "Des. J. Andrade", julgamento: "14/06/2022", resultado: "Improcedente", aderencia: "Baixa" },
];

const TESES = [
  { tese: "Vício do produto — prazo de reparo do art. 18 do CDC", precedentes: 24 },
  { tese: "Dano moral — mero aborrecimento × abalo indenizável", precedentes: 15 },
  { tese: "Inversão do ônus da prova", precedentes: 8 },
];

const RELATORES = [
  { relator: "Des. A. Marques", camara: "9ª Cível", achados: 7, favoraveis: 5 },
  { relator: "Desa. C. Ribeiro", camara: "17ª Cível", achados: 6, favoraveis: 4 },
  { relator: "Des. R. Tavares", camara: "17ª Cível", achados: 4, favoraveis: 2 },
  { relator: "Desa. M. Lopes", camara: "6ª Cível", achados: 3, favoraveis: 1 },
];

const ABAS = [
  { id: "precedentes", rotulo: "Precedentes" },
  { id: "teses", rotulo: "Teses" },
  { id: "relatores", rotulo: "Relatores" },
] as const;

type AbaId = (typeof ABAS)[number]["id"];

const TOM_RESULTADO = {
  Procedente: "procedente",
  Parcial: "parcial",
  Improcedente: "improcedente",
} as const;

export function PainelPrecedentes() {
  const [aba, setAba] = useState<AbaId>("precedentes");
  const [busca, setBusca] = useState("");
  const [resultado, setResultado] = useState("Todos");
  const [aderencia, setAderencia] = useState("Todas");

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return PRECEDENTES.filter((item) => {
      if (resultado !== "Todos" && item.resultado !== resultado) return false;
      if (aderencia !== "Todas" && item.aderencia !== aderencia) return false;
      if (!termo) return true;
      return (
        item.acordao.toLowerCase().includes(termo) ||
        item.camara.toLowerCase().includes(termo) ||
        item.relator.toLowerCase().includes(termo)
      );
    });
  }, [busca, resultado, aderencia]);

  return (
    <Cartao className="overflow-hidden">
      <div className="grid gap-4 border-b border-vn-borda p-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <RotuloCampo htmlFor="rel-busca">Buscar no relatório</RotuloCampo>
          <Campo
            id="rel-busca"
            type="search"
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="Acórdão, câmara ou relator"
          />
        </div>
        <div>
          <RotuloCampo htmlFor="rel-resultado">Resultado</RotuloCampo>
          <Selecao
            id="rel-resultado"
            value={resultado}
            onChange={(event) => setResultado(event.target.value)}
          >
            <option>Todos</option>
            <option>Procedente</option>
            <option>Parcial</option>
            <option>Improcedente</option>
          </Selecao>
        </div>
        <div>
          <RotuloCampo htmlFor="rel-aderencia">Aderência</RotuloCampo>
          <Selecao
            id="rel-aderencia"
            value={aderencia}
            onChange={(event) => setAderencia(event.target.value)}
          >
            <option>Todas</option>
            <option>Alta</option>
            <option>Média</option>
            <option>Baixa</option>
          </Selecao>
        </div>
      </div>

      <Abas abas={ABAS} ativa={aba} onMudar={setAba} className="px-6" />

      {aba === "precedentes" && (
        <div role="tabpanel" id="painel-precedentes" aria-labelledby="aba-precedentes">
          <Rolagem>
            <Tabela>
              <Thead>
                <Th>Acórdão</Th>
                <Th>Câmara</Th>
                <Th>Relator</Th>
                <Th>Julgamento</Th>
                <Th>Resultado</Th>
                <Th>Aderência</Th>
                <Th>Fonte</Th>
              </Thead>
              <Tbody>
                {filtrados.map((item) => (
                  <tr key={item.acordao}>
                    <Td className="num font-medium whitespace-nowrap">{item.acordao}</Td>
                    <Td className="whitespace-nowrap">{item.camara}</Td>
                    <Td className="whitespace-nowrap">{item.relator}</Td>
                    <Td className="num whitespace-nowrap">{item.julgamento}</Td>
                    <Td>
                      <Marcador tom={TOM_RESULTADO[item.resultado]}>{item.resultado}</Marcador>
                    </Td>
                    <Td className="whitespace-nowrap">{item.aderencia}</Td>
                    <Td className="whitespace-nowrap">
                      <span className="text-vn-texto-suave">Inteiro teor →</span>
                    </Td>
                  </tr>
                ))}
                {filtrados.length === 0 && (
                  <tr>
                    <Td colSpan={7} className="text-center text-vn-texto-suave">
                      Nenhum precedente corresponde a esse recorte.
                    </Td>
                  </tr>
                )}
              </Tbody>
            </Tabela>
          </Rolagem>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-vn-borda px-6 py-4">
            <span className="num text-rotulo text-vn-texto-suave">
              Mostrando {filtrados.length} de {PRECEDENTES.length} precedentes
            </span>
            <div className="flex gap-2">
              <Botao variante="secundaria" disabled className="px-3.5 py-2 text-rotulo">
                Anterior
              </Botao>
              <Botao variante="secundaria" disabled className="px-3.5 py-2 text-rotulo">
                Próxima
              </Botao>
            </div>
          </div>
        </div>
      )}

      {aba === "teses" && (
        <div role="tabpanel" id="painel-teses" aria-labelledby="aba-teses" className="p-6">
          <ul className="flex flex-col divide-y divide-vn-borda">
            {TESES.map((item) => (
              <li key={item.tese} className="flex flex-wrap items-baseline justify-between gap-3 py-4 first:pt-0 last:pb-0">
                <span className="max-w-leitura text-apoio text-vn-texto">{item.tese}</span>
                <span className="num text-rotulo font-semibold text-vn-texto-suave">
                  {item.precedentes} precedentes
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {aba === "relatores" && (
        <div role="tabpanel" id="painel-relatores" aria-labelledby="aba-relatores">
          <Rolagem>
            <Tabela>
              <Thead>
                <Th>Relator</Th>
                <Th>Câmara</Th>
                <Th>Achados</Th>
                <Th>Sustentam a tese</Th>
              </Thead>
              <Tbody>
                {RELATORES.map((item) => (
                  <tr key={item.relator}>
                    <Td className="whitespace-nowrap font-medium">{item.relator}</Td>
                    <Td className="whitespace-nowrap">{item.camara}</Td>
                    <Td className="num">{item.achados}</Td>
                    {/* contagem, nunca "tendência favorável": o produto não prevê o voto de ninguém */}
                    <Td className="num">
                      {item.favoraveis}
                      <span className="text-vn-texto-suave"> de {item.achados}</span>
                    </Td>
                  </tr>
                ))}
              </Tbody>
            </Tabela>
          </Rolagem>
        </div>
      )}
    </Cartao>
  );
}
