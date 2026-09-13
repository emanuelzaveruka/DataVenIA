import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";
import { cn } from "./cn";

const BASE =
  "w-full rounded-controle border border-vn-papel-400 bg-vn-superficie px-3 py-[11px] text-[15px] text-vn-texto transition-colors ease-vn placeholder:text-vn-navy-400";

export function Campo({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(BASE, className)} />;
}

export function Selecao({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cn(BASE, className)}>
      {children}
    </select>
  );
}

export function RotuloCampo({
  htmlFor,
  children,
  className,
}: {
  htmlFor: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label htmlFor={htmlFor} className={cn("mb-2 block text-rotulo font-semibold", className)}>
      {children}
    </label>
  );
}
