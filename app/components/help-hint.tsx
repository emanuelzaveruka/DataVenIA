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
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-ink-500 text-[10px] font-semibold leading-none text-ink-600 transition-colors hover:border-ink-900 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green dark:text-ink-400 dark:hover:border-ink-050 dark:hover:text-ink-050"
      >
        <span aria-hidden="true">?</span>
      </button>

      {isOpen && (
        <span
          id={panelId}
          role="tooltip"
          className="absolute left-0 top-full z-20 mt-1.5 block w-[min(20rem,calc(100vw-2.5rem))] rounded-lg border border-ink-300 bg-ink-100 p-3 text-left text-xs font-normal leading-relaxed text-ink-900 shadow-lg dark:border-ink-700 dark:bg-ink-800 dark:text-ink-050"
        >
          <span className="block font-semibold">{entry.term}</span>
          <span className="mt-1 block">{entry.what}</span>
          {stateNote && (
            <span className="mt-2 block border-t border-ink-300 pt-2 text-ink-600 dark:border-ink-700 dark:text-ink-400">
              {stateNote}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
