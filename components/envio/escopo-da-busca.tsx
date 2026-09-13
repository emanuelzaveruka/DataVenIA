"use client";

import { useEffect, useState } from "react";
import { Cartao } from "../ui/cartao";
import { Rotulo } from "../ui/rotulo";
import { Campo, Selecao, RotuloCampo } from "../ui/campo";
import { Chip } from "../ui/chip";
import { Botao } from "../ui/botao";
import { cn } from "../ui/cn";
import { MAX_USER_KEYWORDS } from "../../lib/config/limits.client";

/**
 * Escopo da busca: palavras-chave e recorte, definidos antes de analisar.
 *
 * Ao escolher o arquivo, `/api/documents/termos` faz uma leitura barata da peça (sem modelo, sem
 * persistir nada) e devolve palavras-chave sugeridas. Elas entram como uma lista marcável — o
 * usuário liga/desliga cada sugestão — e ele também pode digitar as próprias, até
 * `MAX_USER_KEYWORDS` no total entre sugeridas e digitadas.
 *
 * Decisão de 2026-09-13: estas palavras-chave deixaram de ser um extra que somava às queries de
 * uma LLM. Não há mais LLM gerando busca nenhuma — o que o usuário selecionar aqui é, sozinho, a
 * ÚNICA query enviada ao TJPR (`lib/workflow/run-pipeline.ts`), daí o limite: a busca do TJPR é AND
 * estrito e cada palavra a mais reduz a contagem de resultados exponencialmente.
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
  const [sugestoes, setSugestoes] = useState<string[]>([]);

  useEffect(() => {
    // Sem arquivo não há o que ler. Limpar os termos é responsabilidade de quem troca o arquivo
    // (o formulário), não deste efeito — aqui um setState síncrono só criaria um render a mais.
    if (!arquivo) {
      setSugestoes([]);
      return;
    }

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
          // Sugestão é conveniência: se a pré-leitura falhar, a análise continua possível — o
          // usuário digita as palavras-chave manualmente. Por isso avisa e segue, em vez de
          // bloquear o envio.
          setAvisoLeitura(
            corpo.error?.userMessage ?? "Não foi possível ler a peça para sugerir palavras-chave.",
          );
          return;
        }
        const sugeridas = corpo.terms ?? [];
        setSugestoes(sugeridas);
        // Pré-seleciona até o limite: quem não quer mexer em nada já sai com uma busca pronta;
        // quem quer, desliga/liga cada sugestão abaixo.
        onTermosChange(sugeridas.slice(0, MAX_USER_KEYWORDS));
      } catch (erro: unknown) {
        if (!ativo || (erro as Error)?.name === "AbortError") return;
        setAvisoLeitura("Não foi possível ler a peça para sugerir palavras-chave.");
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

  const noLimite = termos.length >= MAX_USER_KEYWORDS;
  // Palavras digitadas pelo usuário que não vieram da sugestão — viram chips removíveis à parte,
  // porque não têm uma sugestão correspondente para "desligar".
  const termosDigitados = termos.filter((termo) => !sugestoes.includes(termo));

  function alternarSugestao(sugestao: string) {
    if (termos.includes(sugestao)) {
      onTermosChange(termos.filter((item) => item !== sugestao));
      return;
    }
    if (noLimite) return;
    onTermosChange([...termos, sugestao]);
  }

  function acrescentar() {
    const termo = novoTermo.trim();
    if (!termo || noLimite) return;
    if (!termos.some((existente) => existente.toLowerCase() === termo.toLowerCase())) {
      onTermosChange([...termos, termo]);
    }
    setNovoTermo("");
  }

  return (
    <Cartao className="p-6">
      <Rotulo className="mb-4">Escopo da busca</Rotulo>

      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-rotulo font-semibold">Palavras-chave de busca</span>
        <span className="text-legenda text-vn-texto-suave">
          {lendo ? "lendo a peça…" : `${termos.length}/${MAX_USER_KEYWORDS} selecionadas`}
        </span>
      </div>

      {sugestoes.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {sugestoes.map((sugestao) => {
            const selecionada = termos.includes(sugestao);
            const bloqueada = !selecionada && (desabilitado || noLimite);
            return (
              <button
                key={sugestao}
                type="button"
                role="checkbox"
                aria-checked={selecionada}
                onClick={() => alternarSugestao(sugestao)}
                disabled={desabilitado || bloqueada}
                className={cn(
                  "inline-flex items-center gap-1.5 border px-2.5 py-1.5 text-rotulo transition-colors ease-vn",
                  selecionada
                    ? "border-vn-navy-800 bg-vn-navy-800 text-white"
                    : "border-vn-borda bg-transparent text-vn-texto hover:border-vn-navy-800",
                  bloqueada && "cursor-not-allowed opacity-50 hover:border-vn-borda",
                )}
              >
                <span aria-hidden="true">{selecionada ? "✓" : "+"}</span>
                {sugestao}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-legenda leading-relaxed text-vn-texto-suave">
          {arquivo
            ? lendo
              ? "Extraindo palavras-chave da peça."
              : "Nenhuma palavra-chave sugerida. Digite as suas abaixo."
            : "Escolha um arquivo para ver as palavras-chave sugeridas."}
        </p>
      )}

      {termosDigitados.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {termosDigitados.map((termo) => (
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
      )}

      {avisoLeitura && (
        <p className="mt-3 border-l-[3px] border-l-vn-atencao bg-vn-papel-50 p-3 text-legenda leading-relaxed text-vn-texto">
          {avisoLeitura} Digite manualmente as palavras-chave da busca abaixo.
        </p>
      )}

      {noLimite && (
        <p className="mt-3 text-legenda text-vn-texto-suave">
          Limite de {MAX_USER_KEYWORDS} palavras-chave atingido — remova uma para escolher outra.
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <Campo
          aria-label="Digitar palavra-chave de busca"
          value={novoTermo}
          onChange={(event) => setNovoTermo(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              acrescentar();
            }
          }}
          placeholder="Digitar palavra-chave"
          disabled={desabilitado || noLimite}
        />
        <Botao
          type="button"
          variante="secundaria"
          onClick={acrescentar}
          disabled={desabilitado || noLimite || novoTermo.trim().length === 0}
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
        Estas palavras-chave são a <strong className="font-semibold text-vn-texto">única</strong>{" "}
        busca feita no acervo do TJPR. Prefira poucas e específicas: cada palavra a mais reduz os
        resultados, e uma combinação grande demais pode não encontrar nada.
      </p>
    </Cartao>
  );
}
