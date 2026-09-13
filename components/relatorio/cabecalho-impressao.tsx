import Image from "next/image";

/**
 * Cabeçalho que só existe no PDF exportado.
 *
 * Na tela ele seria redundante — a marca está no topo, o nome do arquivo está no cartão de
 * resultado e o usuário sabe o que acabou de rodar. Fora do navegador nada disso viaja junto: o
 * PDF vai por e-mail, é impresso, é anexado ao processo. Sem identificação, vira um punhado de
 * acórdãos sem dizer de onde saiu nem quando.
 *
 * Usa a versão ESCURA do logotipo (navy + verde) porque a impressão é tinta sobre branco; a versão
 * clara é creme e sairia invisível no papel.
 */
export function CabecalhoImpressao({
  fileName,
  reportId,
  geradoEm,
}: {
  fileName: string;
  reportId: string;
  geradoEm: string;
}) {
  // `pt-BR` fixo: o documento é de foro brasileiro e vai circular em português. Herdar o locale do
  // navegador faria o mesmo relatório sair com data em formato diferente para cada pessoa.
  const data = new Date(geradoEm);
  const dataLegivel = Number.isNaN(data.getTime())
    ? geradoEm
    : data.toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short" });

  return (
    <header className="somente-impressao mb-6 border-b border-vn-borda pb-4">
      <Image
        src="/logo-datavenia-escura.png"
        alt="Data VênIA"
        width={150}
        height={31}
        className="h-8 w-auto"
      />
      <h1 className="mt-3 text-sub font-semibold">Relatório de pesquisa jurisprudencial</h1>
      <p className="num mt-1 text-legenda text-vn-texto-suave">
        {fileName} · execução {reportId.slice(0, 8)} · gerado em {dataLegivel}
      </p>
    </header>
  );
}
