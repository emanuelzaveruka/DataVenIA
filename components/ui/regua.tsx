import { cn } from "./cn";

/**
 * Régua de acento de 3px que antecede todo título de seção (docs/identidade-visual.md).
 * É decorativa: não entra na árvore de acessibilidade.
 */
export function Regua({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("block h-regua w-14 bg-vn-acao", className)} />;
}
