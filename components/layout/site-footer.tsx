import Image from "next/image";
import { Envelope } from "./envelope";

/**
 * Rodapé institucional: só a marca.
 *
 * A linha "JCE SA Brazil · Pesquisa de jurisprudência do TJPR" saiu por decisão do usuário
 * (13/09/2026). O que ela dizia já está dito onde importa — o produto se apresenta na tela Sobre e
 * o tribunal pesquisado aparece no relatório, ao lado dos achados. Repetir no rodapé de toda página
 * era ruído, não informação.
 *
 * Centralizado porque sobrou um elemento só: à esquerda, uma logo sozinha lê como linha
 * interrompida; no centro, lê como fecho.
 */
export function SiteFooter() {
  return (
    <footer className="nao-imprimir mt-24 bg-vn-navy-800 py-10">
      <Envelope className="flex justify-center">
        <Image
          src="/logo-datavenia-clara.png"
          alt="Data VênIA"
          width={126}
          height={26}
          className="h-6 w-auto"
        />
      </Envelope>
    </footer>
  );
}
