"use client";

import { useEffect, useState } from "react";
import { Cartao } from "../ui/cartao";
import { Rotulo } from "../ui/rotulo";
import { Campo, Selecao, RotuloCampo } from "../ui/campo";
import { Chip } from "../ui/chip";
import { Botao } from "../ui/botao";

/**
 * Escopo da busca: termos e recorte, definidos antes de analisar.
 *
 * Ao escolher o arquivo, `/api/documents/termos` faz uma leitura barata da peça (sem modelo, sem
 * persistir nada) e devolve termos sugeridos. Eles entram como chips editáveis: o usuário tira o
 * que não serve e acrescenta o que faltou.
 *
 * Os termos **somam** às queries que o pipeline vai gerar, nunca as substituem. É o que permite
 * esta tela não ter regra nenhuma de validação jurídica: a busca por jurisprudência contrária
 * (HU-11) continua sendo responsabilidade de `generateSearchQueries`, e segue acontecendo
 * independentemente do que o usuário apagar aqui.
 */
export const CAMARAS = [
  { rotulo: "Todas as câmaras", valor: "" },
  { rotulo: "3ª Câmara Cível", valor: "3ª Câmara Cível" },
  { rotulo: "9ª Câmara Cível", valor: "9ª Câmara Cível" },
] as const;

export const PERIODOS = [
  { rotulo: "Todo o acervo", anos: 0 },
  { rotulo: "Últimos 5 anos", anos: 5 },
  { rotulo: "Últimos 3 anos", anos: 3 },
  { rotulo: "Últimos 12 meses", anos: 1 },
] as const;

export function inicioDoPeriodo(anos: number): string | undefined {
  if (anos <= 0) return undefined;
  const data = new Date();
  data.setFullYear(data.getFullYear() - anos);
  return data.toISOString().slice(0, 10);
}

export function EscopoDaBusca({
  arquivo,
  termos,
  onTermosChange,
  camara,
  onCamaraChange,
  periodo,
  onPeriodoChange,
  desabilitado = false,
}: {
  arquivo: File | null;
  termos: string[];
  onTermosChange: (termos: string[]) => void;
  camara: string;
  onCamaraChange: (camara: string) => void;
  periodo: number;
  onPeriodoChange: (anos: number) => void;
  desabilitado?: boolean;
}) {
  const [lendo, setLendo] = useState(false);
  const [avisoLeitura, setAvisoLeitura] = useState<string | null>(null);
  const [novoTermo, setNovoTermo] = useState("");

  useEffect(() => {
    // Sem arquivo não há o que ler. Limpar os termos é responsabilidade de quem troca o arquivo
    // (o formulário), não deste efeito — aqui um setState síncrono só criaria um render a mais.
    if (!arquivo) return;

    const controller = new AbortController();
    let ativo = true;

    void (async () => {
      setLendo(true);
      setAvisoLeitura(null);

      const formData = new FormData();
      formData.append("file", arquivo);

      try {
        const response = await fetch("/api/documents/termos", {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });
        const corpo = (await response.json()) as {
          terms?: string[];
          error?: { userMessage?: string };
        };
        if (!ativo) return;

        if (!response.ok) {
          // Sugestão é conveniência: se a pré-leitura falhar, a análise continua possível com as
          // queries do modelo. Por isso avisa e segue, em vez de bloquear o envio.
          setAvisoLeitura(
            corpo.error?.userMessage ?? "Não foi possível ler a peça para sugerir termos.",
          );
          return;
        }
        onTermosChange(corpo.terms ?? []);
      } catch (erro: unknown) {
        if (!ativo || (erro as Error)?.name === "AbortError") return;
        setAvisoLeitura("Não foi possível ler a peça para sugerir termos.");
      } finally {
        if (ativo) setLendo(false);
      }
    })();

    // Trocar de arquivo no meio da leitura não pode deixar as sugestões do anterior chegarem.
    return () => {
      ativo = false;
      controller.abort();
    };
    // `onTermosChange` vem do pai e mudaria a cada render; a leitura depende só do arquivo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arquivo]);

  function acrescentar() {
    const termo = novoTermo.trim();
    if (!termo) return;
    if (!termos.some((existente) => existente.toLowerCase() === termo.toLowerCase())) {
      onTermosChange([...termos, termo]);
    }
    setNovoTermo("");
  }

  return (
    <Cartao className="p-6">
      <Rotulo className="mb-4">Escopo da busca</Rotulo>

      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-rotulo font-semibold">Termos de busca</span>
        {lendo && <span className="text-legenda text-vn-texto-suave">lendo a peça…</span>}
      </div>

      {termos.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {termos.map((termo) => (
            <Chip
              key={termo}
              onRemover={
                desabilitado
                  ? undefined
                  : () => onTermosChange(termos.filter((item) => item !== termo))
              }
            >
              {termo}
            </Chip>
          ))}
        </div>
      ) : (
        <p className="text-legenda leading-relaxed text-vn-texto-suave">
          {arquivo
            ? lendo
              ? "Extraindo os termos da peça."
              : "Nenhum termo sugerido. Você pode acrescentar os seus abaixo."
            : "Escolha um arquivo para ver os termos sugeridos."}
        </p>
      )}

      {avisoLeitura && (
        <p className="mt-3 border-l-[3px] border-l-vn-atencao bg-vn-papel-50 p-3 text-legenda leading-relaxed text-vn-texto">
          {avisoLeitura} A análise continua possível — o sistema monta as buscas a partir da própria
          peça.
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <Campo
          aria-label="Acrescentar termo de busca"
          value={novoTermo}
          onChange={(event) => setNovoTermo(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              acrescentar();
            }
          }}
          placeholder="Acrescentar termo"
          disabled={desabilitado}
        />
        <Botao
          type="button"
          variante="secundaria"
          onClick={acrescentar}
          disabled={desabilitado || novoTermo.trim().length === 0}
        >
          Incluir
        </Botao>
      </div>

      <div className="mt-5 border-t border-vn-borda pt-5">
        <RotuloCampo htmlFor="en-camara">Câmara</RotuloCampo>
        <Selecao
          id="en-camara"
          value={camara}
          onChange={(event) => onCamaraChange(event.target.value)}
          disabled={desabilitado}
          className="mb-4"
        >
          {CAMARAS.map((opcao) => (
            <option key={opcao.rotulo} value={opcao.valor}>
              {opcao.rotulo}
            </option>
          ))}
        </Selecao>

        <RotuloCampo htmlFor="en-periodo">Período</RotuloCampo>
        <Selecao
          id="en-periodo"
          value={String(periodo)}
          onChange={(event) => onPeriodoChange(Number(event.target.value))}
          disabled={desabilitado}
        >
          {PERIODOS.map((opcao) => (
            <option key={opcao.rotulo} value={opcao.anos}>
              {opcao.rotulo}
            </option>
          ))}
        </Selecao>
      </div>

      <p className="mt-5 border-t border-vn-borda pt-4 text-legenda leading-relaxed text-vn-texto-suave">
        Seus termos <strong className="font-semibold text-vn-texto">somam</strong> às buscas que o
        sistema monta a partir da peça — inclusive a busca por jurisprudência contrária, que roda
        sempre.
      </p>
    </Cartao>
  );
}
