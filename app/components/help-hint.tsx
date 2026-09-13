"use client";

import { useId, useRef, useState } from "react";
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
 * 3. **Cores só por token** (`ink-*`, `brand-green`), seguindo `app/page.tsx` e
 *    `app/report-view.tsx`. O modal do orquestrador usa a paleta crua do Tailwind e é a exceção
 *    do projeto, não o padrão.
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
  const panelId = useId();
  const containerRef = useRef<HTMLSpanElement>(null);

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
          id={panelId}
          role="tooltip"
          className="absolute top-full left-0 z-50 mt-1.5 block w-[min(20rem,calc(100vw-2.5rem))] rounded-card border border-vn-borda border-l-[3px] border-l-vn-acao bg-vn-superficie p-4 text-left text-legenda leading-relaxed font-normal text-vn-texto shadow-[0_8px_24px_rgba(16,36,61,0.16)]"
        >
          <span className="block font-semibold">{entry.term}</span>
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
