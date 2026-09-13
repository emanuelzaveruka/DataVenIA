"use client";

import { cn } from "./cn";

/**
 * Abas do protótipo. `role="tablist"` de verdade: setas ←/→ navegam, e só a aba ativa fica no
 * tab order — um `<button>` solto por aba obrigaria o teclado a passar por todas antes de chegar
 * ao conteúdo.
 */
export function Abas<T extends string>({
  abas,
  ativa,
  onMudar,
  className,
}: {
  abas: ReadonlyArray<{ id: T; rotulo: string }>;
  ativa: T;
  onMudar: (id: T) => void;
  className?: string;
}) {
  function handleKeyDown(event: React.KeyboardEvent, indice: number) {
    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (delta === 0) return;
    event.preventDefault();
    const proxima = abas[(indice + delta + abas.length) % abas.length];
    if (proxima) onMudar(proxima.id);
  }

  return (
    <div
      role="tablist"
      aria-label="Visões do relatório"
      className={cn("flex flex-wrap border-b border-vn-borda", className)}
    >
      {abas.map((aba, indice) => {
        const selecionada = aba.id === ativa;
        return (
          <button
            key={aba.id}
            role="tab"
            type="button"
            id={`aba-${aba.id}`}
            aria-selected={selecionada}
            aria-controls={`painel-${aba.id}`}
            tabIndex={selecionada ? 0 : -1}
            onClick={() => onMudar(aba.id)}
            onKeyDown={(event) => handleKeyDown(event, indice)}
            className={cn(
              "-mb-px cursor-pointer border-0 border-b-[3px] bg-transparent px-5 py-3.5 text-apoio whitespace-nowrap transition-colors ease-vn",
              selecionada
                ? "border-b-vn-acao font-bold text-vn-texto"
                : "border-b-transparent font-medium text-vn-texto-suave hover:text-vn-texto",
            )}
          >
            {aba.rotulo}
          </button>
        );
      })}
    </div>
  );
}
