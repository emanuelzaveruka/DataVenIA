import { Envelope } from "./envelope";

export function SiteFooter() {
  return (
    <footer className="mt-24 bg-vn-navy-800 py-10 text-vn-texto-inverso">
      <Envelope className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <span aria-hidden="true" className="inline-block h-5 w-regua bg-vn-acao" />
          <span className="text-[15px] font-extrabold tracking-[-0.01em]">Data&nbsp;VênIA</span>
        </div>
        <p className="text-legenda text-vn-navy-300">
          JCE SA Brazil · Pesquisa de jurisprudência do TJPR
        </p>
      </Envelope>
    </footer>
  );
}
