import Link from "next/link";
import { UploadForm } from "./upload-form";
import { ResearchDisclaimer } from "./research-disclaimer";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-12">
      <header className="text-center">
        <h1 className="text-3xl font-semibold">Data VênIA</h1>
        <p className="mt-2 text-sm text-ink-600 dark:text-ink-400">
          Envie uma petição, decisão, recurso ou manifestação em PDF, DOCX ou TXT para iniciar a
          pesquisa de jurisprudência do TJPR.
        </p>
      </header>

      <ResearchDisclaimer />
      <PrivacyNotice />
      <UploadForm />

      <p className="text-center text-xs text-ink-600 dark:text-ink-400">
        <Link href="/relatorio-demo" className="underline underline-offset-2">
          Ver um relatório de exemplo
        </Link>{" "}
        gerado sobre a jurisprudência fictícia de demonstração.
      </p>
    </main>
  );
}

function PrivacyNotice() {
  return (
    <div className="rounded-lg border border-ink-300 border-l-4 border-l-ink-500 bg-ink-100 p-4 text-sm text-ink-900 dark:border-ink-700 dark:border-l-ink-500 dark:bg-ink-800 dark:text-ink-050">
      <p className="font-medium">Antes de enviar, saiba como tratamos seus dados:</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>
          Dados pessoais identificáveis (CPF/CNPJ, endereço, telefone, e-mail, nomes de partes não
          essenciais) são mascarados automaticamente antes de qualquer análise.
        </li>
        <li>
          O conteúdo do seu documento não é usado para treinar modelos e não é compartilhado além
          do necessário para gerar o relatório desta sessão.
        </li>
        <li>
          Por padrão, os dados da sessão são descartados ao fechar o navegador, exceto o cache
          público de jurisprudência do TJPR (que não contém dados de clientes).
        </li>
      </ul>
    </div>
  );
}
