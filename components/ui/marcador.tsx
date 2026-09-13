import { cn } from "./cn";

/**
 * Badge de estado. Os tons vêm do protótipo (.m-*).
 *
 * ATENÇÃO (§3.10/HU-29): estes marcadores descrevem estado OPERACIONAL (processando, concluído,
 * atenção) ou desfecho já ocorrido de um acórdão citado. Eles NÃO podem ser usados para sugerir
 * chance de êxito do caso do usuário — o produto é proibido de prever resultado. Classificação de
 * posição jurídica (sustenta/contraria/mista) usa `stance-*`, que é categórica e pareada em
 * luminância, nunca esta escala.
 */
type Tom = "procedente" | "parcial" | "atencao" | "improcedente" | "neutro";

const TONS: Record<Tom, string> = {
  procedente: "text-vn-verde-700 bg-vn-verde-100 border border-vn-verde-200",
  parcial: "text-vn-navy-800 bg-vn-navy-100 border border-vn-navy-200",
  atencao: "text-[#8A3D22] bg-[#F7EDE4] border border-[#E4CDB6]",
  improcedente: "text-white bg-vn-critico",
  neutro: "text-vn-texto-suave bg-vn-papel-100 border border-vn-borda",
};

export function Marcador({
  tom = "neutro",
  children,
  className,
}: {
  tom?: Tom;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block px-[9px] py-1 text-legenda font-bold tracking-[0.06em] whitespace-nowrap uppercase",
        TONS[tom],
        className,
      )}
    >
      {children}
    </span>
  );
}
