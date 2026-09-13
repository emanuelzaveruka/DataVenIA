import type { Metadata } from "next";
import { UploadForm } from "../upload-form";
import { ResearchDisclaimer } from "../research-disclaimer";
import { Envelope } from "@/components/layout/envelope";
import { Regua } from "@/components/ui/regua";

export const metadata: Metadata = {
  title: "Nova pesquisa · Data VênIA",
  description: "Envie a peça que servirá de base para a pesquisa de jurisprudência do TJPR.",
};

export default function EnvioPage() {
  return (
    <Envelope className="pb-24">
      <section className="pt-14">
        <Regua className="mb-5" />
        <h1 className="text-titulo font-bold tracking-[-0.01em]">Nova pesquisa</h1>
        <p className="mt-2 max-w-prosa text-[15px] leading-relaxed text-vn-texto-suave">
          Envie a peça que servirá de base. O sistema extrai as teses e busca os acórdãos
          correspondentes no acervo do TJPR.
        </p>
      </section>

      {/* HU-28: o aviso não é dispensável e precede o envio, não só o resultado. */}
      <ResearchDisclaimer className="mt-8" />

      <div className="pt-8">
        <UploadForm />
      </div>
    </Envelope>
  );
}
