import { cn } from "./cn";

/**
 * Superfície branca sobre o creme da página. Cantos retos por definição da marca — `rounded-card`
 * é 0px e existe como token para que "card sem raio" seja uma decisão nomeada, não um esquecimento.
 */
export function Cartao({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn("rounded-card border border-vn-borda bg-vn-superficie", className)}
    >
      {children}
    </div>
  );
}
