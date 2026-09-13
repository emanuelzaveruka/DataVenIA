import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

/**
 * Variantes exatamente as do protótipo (.btn-*). `clara` existe para uso SOBRE navy — é a única
 * que inverte no hover; as demais assumem fundo creme.
 *
 * `vn-acao` (verde 500) só aparece como FUNDO com texto branco. Como cor de texto ele reprova em
 * AA sobre creme, e por isso `texto` usa verde 600/700.
 */
type Variante = "primaria" | "secundaria" | "texto" | "clara";

const VARIANTES: Record<Variante, string> = {
  primaria: "bg-vn-acao text-white hover:bg-vn-acao-hover active:bg-vn-acao-ativa",
  secundaria:
    "bg-transparent text-vn-navy-800 border border-vn-navy-800 px-5 py-2.5 hover:bg-vn-navy-100",
  texto: "bg-transparent text-vn-verde-600 px-2 hover:text-vn-verde-700 hover:underline",
  clara: "bg-vn-acao text-white hover:bg-vn-verde-400 hover:text-vn-navy-900",
};

export function Botao({
  variante = "primaria",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante }) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-2 rounded-controle border-0 px-5 py-[11px] text-apoio font-semibold transition-colors ease-vn",
        VARIANTES[variante],
        // Desabilitado é neutro, nunca verde apagado: precisa ler como "não disponível", não como
        // "ação secundária". navy-500 e não 400 — sobre creme o 400 fica em 3,6:1, abaixo de AA.
        "disabled:cursor-not-allowed disabled:border disabled:border-vn-borda disabled:bg-vn-papel-100 disabled:text-vn-navy-500 disabled:hover:bg-vn-papel-100 disabled:hover:text-vn-navy-500 disabled:hover:no-underline",
        className,
      )}
    />
  );
}
