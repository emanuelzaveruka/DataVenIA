import { cn } from "../ui/cn";
import { Regua } from "../ui/regua";

/**
 * Bloco vertical padrão. Quando recebe `titulo`, já entrega a régua de acento acima dele — a
 * ordem régua → título é a regra da marca e não deveria depender de cada tela lembrar dela.
 */
export function Secao({
  titulo,
  descricao,
  acao,
  children,
  className,
}: {
  titulo?: string;
  descricao?: string;
  acao?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("pt-14 lg:pt-[72px]", className)}>
      {titulo && (
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Regua className="mb-5" />
            <h2 className="text-titulo font-bold tracking-[-0.01em]">{titulo}</h2>
            {descricao && (
              <p className="mt-2 max-w-prosa text-[15px] leading-relaxed text-vn-texto-suave">
                {descricao}
              </p>
            )}
          </div>
          {acao}
        </div>
      )}
      {children}
    </section>
  );
}
