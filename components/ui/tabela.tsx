import { cn } from "./cn";

/**
 * Tabela da marca: cabeçalho navy, zebra em papel-50, sem raio.
 *
 * `Rolagem` é obrigatória em volta — a tabela de precedentes tem coluna de ementa e nunca cabe em
 * 400px. Sem o wrapper, quem rola horizontalmente é a PÁGINA inteira, e aí o cabeçalho fixo e o
 * rodapé saem do lugar no celular.
 */
export function Rolagem({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("overflow-x-auto", className)}>{children}</div>;
}

export function Tabela({ children, className }: { children: React.ReactNode; className?: string }) {
  return <table className={cn("w-full border-collapse text-apoio", className)}>{children}</table>;
}

export function Th({ children, className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      {...props}
      className={cn(
        "px-5 py-3 text-left text-legenda font-bold tracking-[0.1em] whitespace-nowrap uppercase",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Thead({ children }: { children: React.ReactNode }) {
  return (
    <thead>
      <tr className="bg-vn-navy-800 text-left text-vn-texto-inverso">{children}</tr>
    </thead>
  );
}

export function Tbody({ children }: { children: React.ReactNode }) {
  return (
    <tbody className="[&_tr:last-child_td]:border-b-0 [&_tr:nth-child(even)]:bg-vn-papel-50">
      {children}
    </tbody>
  );
}

export function Td({ children, className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td {...props} className={cn("border-b border-vn-borda px-5 py-3.5 align-top", className)}>
      {children}
    </td>
  );
}
