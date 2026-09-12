import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JurisFlow",
  description:
    "Pesquisa de jurisprudência do TJPR com relatório sourced e verificável.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
