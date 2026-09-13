"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Envelope } from "./envelope";
import { cn } from "../ui/cn";

/**
 * Navegação única do produto.
 *
 * A barra do protótipo (`.proto-bar`) era um seletor de telas para demonstração, não navegação
 * real — aqui ela vira o menu de verdade, com as rotas do App Router.
 *
 * Ordem por decisão do usuário (13/09/2026): o trabalho vem primeiro (Envio) e a apresentação do
 * produto vai para o fim, renomeada de "Landing" para "Sobre". Ela continua sendo a rota "/", então
 * quem chega pela raiz cai na apresentação e a logo sempre volta para lá.
 *
 * Fica sobre navy porque o cabeçalho institucional das telas de Landing e Relatório é navy e os
 * dois precisam emendar sem costura visível.
 */
const ABAS = [
  { href: "/envio", rotulo: "Envio" },
  { href: "/historico", rotulo: "Histórico" },
  { href: "/relatorio", rotulo: "Relatório" },
  { href: "/", rotulo: "Sobre" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b-[3px] border-vn-acao bg-vn-navy-900">
      <Envelope className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
        {/*
          A versão "clara" do logotipo (creme + verde) é a que existe para fundo escuro. A "escura"
          é navy sobre navy — sumiria metade da palavra.

          `width`/`height` batem com a proporção real do arquivo (972x200) para o navegador reservar
          o espaço antes de baixar a imagem: sem isso o menu pula quando a logo chega. `priority`
          porque o cabeçalho está acima da dobra em todas as telas.
        */}
        <Link href="/" className="mr-2 flex items-center">
          <Image
            src="/logo-datavenia-clara.png"
            alt="Data VênIA"
            width={136}
            height={28}
            priority
            className="h-7 w-auto"
          />
        </Link>

        <nav aria-label="Navegação principal" className="flex flex-wrap items-center gap-1">
          {ABAS.map((aba) => {
            // "/" só é atual quando é exatamente "/": com `startsWith` a Landing ficaria marcada
            // em todas as rotas.
            const atual = aba.href === "/" ? pathname === "/" : pathname.startsWith(aba.href);
            return (
              <Link
                key={aba.href}
                href={aba.href}
                aria-current={atual ? "page" : undefined}
                className={cn(
                  "rounded-controle border border-transparent px-3 py-1.5 text-rotulo font-semibold transition-colors ease-vn",
                  atual
                    ? "border-vn-verde-400 bg-vn-verde-400 text-vn-navy-900 hover:text-vn-navy-900"
                    : "text-vn-navy-200 hover:bg-vn-navy-800 hover:text-white",
                )}
              >
                {aba.rotulo}
              </Link>
            );
          })}
        </nav>

        <span className="ml-auto hidden text-legenda text-vn-navy-300 sm:inline">
          Pesquisa de jurisprudência · TJPR
        </span>
      </Envelope>
    </header>
  );
}
