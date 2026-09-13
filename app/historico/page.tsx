import type { Metadata } from "next";
import Link from "next/link";
import { Envelope } from "@/components/layout/envelope";
import { Cartao } from "@/components/ui/cartao";
import { Regua } from "@/components/ui/regua";
import { Marcador } from "@/components/ui/marcador";
import { Rolagem, Tabela, Thead, Tbody, Th, Td } from "@/components/ui/tabela";

export const metadata: Metadata = {
  title: "Histórico · Data VênIA",
  description: "Pesquisas anteriores desta conta.",
};

/**
 * Histórico de pesquisas — substitui a tela "Acesso" do protótipo.
 *
 * Decisão do usuário (13/09/2026): a tela de login vira histórico. Login/cadastro está em "fora do
 * escopo" no `docs/escopo.md` (§10) e entrar com ele exigiria decisão explícita de expansão; um
 * histórico das execuções da própria sessão, não.
 *
 * ESTADO REAL: os dados abaixo são fixos. O repositório padrão é o em memória
 * (`lib/persistence/in-memory-repository.ts`) e HU-06 manda descartar a sessão ao fechar o
 * navegador — então "histórico que persiste" não existe hoje nem por acidente. Listar execuções de
 * verdade depende de `listRuns` no `DataVeniaRepository` + Supabase provisionado: backlog.
 */
const PESQUISAS = [
  {
    id: "run-2026-09-12-004",
    data: "12/09/2026",
    peca: "recurso-inominado-consumidor.pdf",
    questoes: 3,
    precedentes: 9,
    situacao: "Concluída",
    tom: "procedente" as const,
  },
  {
    id: "run-2026-09-11-003",
    data: "11/09/2026",
    peca: "contestacao-plano-de-saude.docx",
    questoes: 2,
    precedentes: 6,
    situacao: "Concluída",
    tom: "procedente" as const,
  },
  {
    id: "run-2026-09-10-002",
    data: "10/09/2026",
    peca: "apelacao-civel-reajuste.pdf",
    questoes: 1,
    precedentes: 0,
    situacao: "Sem achados",
    tom: "parcial" as const,
  },
  {
    id: "run-2026-09-09-001",
    data: "09/09/2026",
    peca: "peticao-inicial-danos-morais.pdf",
    questoes: 0,
    precedentes: 0,
    situacao: "Falhou",
    tom: "improcedente" as const,
  },
] as const;

export default function HistoricoPage() {
  return (
    <Envelope className="pb-24">
      <section className="pt-14">
        <Regua className="mb-5" />
        <h1 className="text-titulo font-bold tracking-[-0.01em]">Histórico de pesquisas</h1>
        <p className="mt-2 max-w-prosa text-[15px] leading-relaxed text-vn-texto-suave">
          Execuções anteriores, com a peça de origem e o que cada uma produziu.
        </p>
      </section>

      <Cartao className="mt-6 border-l-[3px] border-l-vn-info p-6">
        <h2 className="mb-2 text-apoio font-bold">Tela de demonstração</h2>
        <p className="max-w-leitura text-rotulo leading-relaxed text-vn-texto-suave">
          As linhas abaixo são fixas. Hoje a aplicação guarda a execução em memória e descarta os
          dados da sessão ao fechar o navegador — histórico persistente depende de banco
          provisionado e está no backlog.
        </p>
      </Cartao>

      <Cartao className="mt-6 overflow-hidden">
        <Rolagem>
          <Tabela>
            <Thead>
              <Th>Data</Th>
              <Th>Peça enviada</Th>
              <Th>Questões</Th>
              <Th>Precedentes</Th>
              <Th>Situação</Th>
              <Th>Relatório</Th>
            </Thead>
            <Tbody>
              {PESQUISAS.map((pesquisa) => (
                <tr key={pesquisa.id}>
                  <Td className="num whitespace-nowrap">{pesquisa.data}</Td>
                  <Td className="font-medium">{pesquisa.peca}</Td>
                  <Td className="num">{pesquisa.questoes}</Td>
                  <Td className="num">{pesquisa.precedentes}</Td>
                  <Td>
                    <Marcador tom={pesquisa.tom}>{pesquisa.situacao}</Marcador>
                  </Td>
                  <Td>
                    {pesquisa.situacao === "Concluída" ? (
                      <Link href="/relatorio" className="font-semibold">
                        Abrir →
                      </Link>
                    ) : (
                      <span className="text-vn-texto-suave">—</span>
                    )}
                  </Td>
                </tr>
              ))}
            </Tbody>
          </Tabela>
        </Rolagem>
      </Cartao>

      <p className="mt-6 text-apoio text-vn-texto-suave">
        <Link href="/envio" className="font-semibold">
          Iniciar nova pesquisa →
        </Link>
      </p>
    </Envelope>
  );
}
