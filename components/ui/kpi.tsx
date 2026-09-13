import { cn } from "./cn";

/**
 * Número grande com rótulo. `sobreNavy` porque a tela de relatório exibe os KPIs dentro do
 * cabeçalho institucional, onde o texto suave padrão não teria contraste.
 *
 * `num` (numeral tabular) não é enfeite: sem ele os dígitos mudam de largura e a fileira de KPIs
 * treme a cada atualização do stream.
 */
export function Kpi({
  valor,
  rotulo,
  apoio,
  sobreNavy = false,
  className,
}: {
  valor: React.ReactNode;
  rotulo: string;
  apoio?: string;
  sobreNavy?: boolean;
  className?: string;
}) {
  return (
    <div className={cn(sobreNavy ? "text-vn-texto-inverso" : "text-vn-texto", className)}>
      <div className="num text-titulo font-bold tracking-[-0.01em]">{valor}</div>
      <div
        className={cn(
          "mt-1 text-rotulo font-semibold tracking-[0.12em] uppercase",
          sobreNavy ? "text-vn-navy-300" : "text-vn-texto-suave",
        )}
      >
        {rotulo}
      </div>
      {apoio && (
        <div className={cn("mt-1 text-legenda", sobreNavy ? "text-vn-navy-300" : "text-vn-texto-suave")}>
          {apoio}
        </div>
      )}
    </div>
  );
}
