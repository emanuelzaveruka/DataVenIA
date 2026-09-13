import { cn } from "./cn";

/** Rótulo de seção em caixa alta — o "olho" tipográfico da marca acima de blocos e cards. */
export function Rotulo({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "text-rotulo font-semibold tracking-[0.12em] uppercase text-vn-texto-suave",
        className,
      )}
    >
      {children}
    </div>
  );
}
