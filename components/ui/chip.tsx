"use client";

import { cn } from "./cn";

/**
 * Filtro ativo. Quando recebe `onRemover` vira botão de verdade — o "×" do protótipo é um glifo
 * decorativo e sozinho não seria alcançável por teclado nem anunciado por leitor de tela.
 */
export function Chip({
  children,
  onRemover,
  className,
}: {
  children: React.ReactNode;
  onRemover?: () => void;
  className?: string;
}) {
  const base = cn(
    "inline-flex items-center gap-2 border border-vn-borda bg-vn-papel-100 px-2.5 py-1.5 text-rotulo",
    className,
  );

  if (!onRemover) return <span className={base}>{children}</span>;

  return (
    <span className={base}>
      {children}
      <button
        type="button"
        onClick={onRemover}
        aria-label={`Remover filtro ${typeof children === "string" ? children : ""}`.trim()}
        className="cursor-pointer border-0 bg-transparent p-0 leading-none text-vn-navy-400 transition-colors ease-vn hover:text-vn-critico"
      >
        ×
      </button>
    </span>
  );
}
