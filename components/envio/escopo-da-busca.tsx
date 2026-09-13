"use client";

import { useEffect, useState } from "react";
import { Cartao } from "../ui/cartao";
import { Rotulo } from "../ui/rotulo";
import { Campo, Selecao, RotuloCampo } from "../ui/campo";
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

/**
 * Uma palavra-chave marcável — sugerida pela leitura da peça ou digitada pelo usuário. Mesmo
 * componente para as duas origens (liga/desliga do mesmo jeito, mesmo teto de seleção); só a cor
 * da borda muda, para o usuário distinguir "o sistema sugeriu" de "eu digitei" à primeira vista.
 */
function BotaoPalavraChave({
  termo,
  origem,
  selecionada,
  bloqueada,
  onClick,
}: {
  termo: string;
  origem: "sugestao" | "digitado";
  selecionada: boolean;
  bloqueada: boolean;
  onClick: () => void;
}) {
  const digitado = origem === "digitado";
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selecionada}
      aria-label={digitado ? `${termo} (digitada por você)` : termo}
      onClick={onClick}
      disabled={bloqueada}
      className={cn(
        "inline-flex items-center gap-1.5 border px-2.5 py-1.5 text-rotulo transition-colors ease-vn",
        selecionada
          ? digitado
            ? "border-vn-acao bg-vn-acao text-white"
            : "border-vn-navy-800 bg-vn-navy-800 text-white"
          : digitado
            ? "border-vn-acao bg-transparent text-vn-texto hover:bg-vn-verde-100"
            : "border-vn-borda bg-transparent text-vn-texto hover:border-vn-navy-800",
        bloqueada && !selecionada && "cursor-not-allowed opacity-50 hover:bg-transparent",
      )}
    >
      <span aria-hidden="true">{selecionada ? "✓" : "+"}</span>
      {termo}
    </button>
  );
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
  // Palavras digitadas pelo usuário — persistem como opção marcável, igual às sugestões, em vez de
  // sumirem quando desmarcadas. Sem isto, desligar uma palavra digitada a perderia de vez.
  const [digitados, setDigitados] = useState<string[]>([]);

  useEffect(() => {
    // Sem arquivo não há o que ler. Limpar os termos é responsabilidade de quem troca o arquivo
    // (o formulário), não deste efeito — aqui um setState síncrono só criaria um render a mais.
    setDigitados([]);
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
        setSugestoes(corpo.terms ?? []);
        // Nada pré-selecionado: o usuário escolhe ativamente. Selecionar tudo até o teto de
        // propósito deixava quem quisesse digitar a própria palavra sem campo disponível — o
        // limite já vinha "batido" antes de qualquer ação.
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

  function alternar(termo: string) {
    if (termos.includes(termo)) {
      onTermosChange(termos.filter((item) => item !== termo));
      return;
    }
    if (noLimite) return;
    onTermosChange([...termos, termo]);
  }

  function acrescentar() {
    const termo = novoTermo.trim();
    if (!termo || noLimite) return;
    const jaListado = [...sugestoes, ...digitados].some(
      (existente) => existente.toLowerCase() === termo.toLowerCase(),
    );
    if (!jaListado) setDigitados((atual) => [...atual, termo]);
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

      {sugestoes.length > 0 || digitados.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {sugestoes.map((termo) => (
            <BotaoPalavraChave
              key={`sugestao-${termo}`}
              termo={termo}
              origem="sugestao"
              selecionada={termos.includes(termo)}
              bloqueada={desabilitado || (!termos.includes(termo) && noLimite)}
              onClick={() => alternar(termo)}
            />
          ))}
          {digitados.map((termo) => (
            <BotaoPalavraChave
              key={`digitado-${termo}`}
              termo={termo}
              origem="digitado"
              selecionada={termos.includes(termo)}
              bloqueada={desabilitado || (!termos.includes(termo) && noLimite)}
              onClick={() => alternar(termo)}
            />
          ))}
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
