import { cn } from "./cn";

/**
 * Grafismo de círculos concêntricos do cabeçalho institucional.
 *
 * Regra da marca: sempre SOBRE navy, sempre com borda navy-700, nunca preenchido — é textura de
 * fundo, não ilustração. Puramente decorativo, então fica fora da árvore de acessibilidade.
 *
 * Os círculos são posicionados em % do bloco e estouram a caixa de propósito; o `overflow-hidden`
 * do container é o que os recorta.
 */
export function Grafismo({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative overflow-hidden bg-vn-navy-800", className)}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <span className="absolute -top-[22%] -right-[6%] h-[420px] w-[420px] rounded-full border-[3px] border-vn-navy-700" />
        <span className="absolute -top-[8%] -right-[2%] h-[260px] w-[260px] rounded-full border-[3px] border-vn-navy-700" />
        <span className="absolute -bottom-[40%] -left-[8%] h-[340px] w-[340px] rounded-full border-[3px] border-vn-navy-700" />
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}
