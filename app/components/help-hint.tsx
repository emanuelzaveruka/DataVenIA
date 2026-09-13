"use client";

import { useCallback, useId, useLayoutEffect, useRef, useState } from "react";
import type { GlossaryEntry } from "../../lib/config/glossary";
import type { PipelineStepStatus } from "../../lib/observability/pipeline-progress";

/**
 * Ajuda contextual ("?") ao lado de um rótulo que o usuário não tem por que conhecer.
 *
 * Três decisões que não são estilo:
 *
 * 1. **É um `<button>`, não um `<span>` com hover.** Hover sozinho não existe no celular e não
 *    existe no teclado — o "?" é a única explicação de termos como "Scratchpads válidos", então
 *    trancá-la atrás do mouse esconderia o conteúdo de quem mais precisa dele. Abre em hover,
 *    em foco e em clique; o clique fixa (é o que funciona no toque), `Escape` fecha.
 *
 * 2. **O estado da etapa entra no texto.** "Evidências verificadas (0)" não quer dizer a mesma
 *    coisa que "Evidências verificadas" ainda não alcançada, e a diferença entre as duas é
 *    justamente o que o usuário pergunta. Quando há texto específico para o estado, ele aparece
 *    junto do texto geral, não no lugar dele.
 *
 * 3. **Cores só por token** (`vn-*`). O modal do orquestrador usa a paleta crua do Tailwind e é
 *    a exceção do projeto, não o padrão.
 *
 * 4. **O painel se vira sozinho para caber na janela.** Ele abre para baixo por padrão, mas a
 *    última etapa da lista costuma estar no rodapé da tela — e um tooltip que abre para fora da
 *    viewport não é um detalhe estético, é a explicação ficando ilegível justamente para quem
 *    clicou nela. Por isso a posição é MEDIDA na abertura (`getBoundingClientRect`) em vez de
 *    fixa: falta espaço embaixo, abre para cima; falta espaço à direita, alinha pela direita.
 *    CSS sozinho não resolve — `position: absolute` não conhece a viewport.
 */
export function HelpHint({
  entry,
  status,
  className = "",
}: {
  entry: GlossaryEntry;
  status?: PipelineStepStatus;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [lado, setLado] = useState<{ acima: boolean; aDireita: boolean }>({
    acima: false,
    aDireita: false,
  });
  const panelId = useId();
  const containerRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLSpanElement>(null);

  /**
   * Mede depois de pintar, antes do browser desenhar (`useLayoutEffect`): com `useEffect` o painel
   * apareceria um quadro no lugar errado e pularia. A altura vem do próprio painel quando ele já
   * existe; no primeiro quadro cai no palpite de 200px, que é a altura típica de uma entrada do
   * glossário com nota de estado.
   */
  const posicionar = useCallback(() => {
    const alvo = containerRef.current;
    if (!alvo) return;
    const caixa = alvo.getBoundingClientRect();
    const altura = panelRef.current?.offsetHeight ?? 200;
    const largura = panelRef.current?.offsetWidth ?? 320;

    const espacoAbaixo = window.innerHeight - caixa.bottom;
    const espacoAcima = caixa.top;
    const espacoADireita = window.innerWidth - caixa.left;

    setLado({
      // só sobe se realmente couber em cima — senão descer e cortar um pouco é melhor do que
      // subir e cortar no topo, onde fica o termo que nomeia a explicação.
      acima: espacoAbaixo < altura + 12 && espacoAcima > espacoAbaixo,
      aDireita: espacoADireita < largura + 12,
    });
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) return;
    posicionar();
    window.addEventListener("resize", posicionar);
    window.addEventListener("scroll", posicionar, true);
    return () => {
      window.removeEventListener("resize", posicionar);
      window.removeEventListener("scroll", posicionar, true);
    };
  }, [isOpen, posicionar]);

  const stateNote =
    status === "EMPTY"
      ? entry.empty
      : status === "FAILED"
        ? (entry.failed ?? entry.pending)
        : status === "PENDING"
          ? entry.pending
          : undefined;

  function close() {
    setIsOpen(false);
    setIsPinned(false);
  }

  return (
    <span
      ref={containerRef}
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => !isPinned && setIsOpen(false)}
    >
      <button
        type="button"
        aria-label={`O que significa "${entry.term}"`}
        aria-expanded={isOpen}
        aria-describedby={isOpen ? panelId : undefined}
        onFocus={() => setIsOpen(true)}
        onBlur={() => close()}
        onClick={() => {
          // Fixar é o que torna o "?" utilizável no toque, onde hover não existe.
          if (isPinned) close();
          else {
            setIsPinned(true);
            setIsOpen(true);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && isOpen) {
            event.stopPropagation();
            close();
          }
        }}
        className="flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-full border border-vn-navy-400 text-[10px] leading-none font-semibold text-vn-texto-suave transition-colors ease-vn hover:border-vn-acao hover:text-vn-acao"
      >
        <span aria-hidden="true">?</span>
      </button>

      {isOpen && (
        <span
          ref={panelRef}
          id={panelId}
          role="tooltip"
          className={[
            "absolute z-50 block w-[min(20rem,calc(100vw-2.5rem))] rounded-card border border-vn-borda border-l-[3px] border-l-vn-acao bg-vn-superficie p-3.5 text-left text-[10px] leading-relaxed font-normal text-vn-texto shadow-[0_8px_24px_rgba(16,36,61,0.16)]",
            lado.acima ? "bottom-full mb-1.5" : "top-full mt-1.5",
            lado.aDireita ? "right-0" : "left-0",
          ].join(" ")}
        >
          <span className="block text-[11px] font-semibold">{entry.term}</span>
          <span className="mt-1 block">{entry.what}</span>
          {stateNote && (
            <span className="mt-2.5 block border-t border-vn-borda pt-2.5 text-vn-texto-suave">
              {stateNote}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
