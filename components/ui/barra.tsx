import { cn } from "./cn";

/**
 * Barra de distribuição. A largura é proporção da amostra, NUNCA probabilidade de êxito
 * (§3.10/HU-29) — por isso o valor exibido ao lado é sempre a contagem absoluta, e o rótulo diz de
 * quantos. Sem o "de N", uma barra cheia leria como "100% de chance", que é exatamente o que o
 * produto é proibido de sugerir.
 */
export function Barra({
  rotulo,
  valor,
  total,
  className,
}: {
  rotulo: string;
  valor: number;
  total: number;
  className?: string;
}) {
  const proporcao = total > 0 ? Math.round((valor / total) * 100) : 0;
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-apoio text-vn-texto">{rotulo}</span>
        <span className="num text-apoio font-semibold text-vn-texto">
          {valor}
          <span className="font-normal text-vn-texto-suave"> de {total}</span>
        </span>
      </div>
      <div
        role="img"
        aria-label={`${rotulo}: ${valor} de ${total} decisões da amostra`}
        className="h-1.5 w-full bg-vn-papel-200"
      >
        <div className="h-full bg-vn-acao" style={{ width: `${proporcao}%` }} />
      </div>
    </div>
  );
}
