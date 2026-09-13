import { cn } from "../ui/cn";

/** Medida do produto: 1140px com respiro de 48px (24px no mobile). */
export function Envelope({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("mx-auto w-full max-w-[1140px] px-6 md:px-12", className)}>{children}</div>;
}
