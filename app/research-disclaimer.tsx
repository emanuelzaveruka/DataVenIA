/**
 * HU-28 — aviso de apoio à pesquisa. Deliberadamente sem botão de fechar e sem estado: a validação
 * da HU exige que ele **não** seja dispensável nem some após a primeira visualização. Fica em um
 * componente único porque o mesmo texto exato (§7.2) tem que aparecer no upload e no resultado.
 */
export function ResearchDisclaimer({ className = "" }: { className?: string }) {
  return (
    <aside
      role="note"
      aria-label="Aviso sobre o uso do resultado"
      className={`rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200 ${className}`}
    >
      <p className="font-medium">
        Resultado de apoio à pesquisa. Confirme a fonte e realize revisão jurídica independente.
      </p>
      <p className="mt-1 text-xs">
        A classificação é triagem de pesquisa jurisprudencial — não é parecer jurídico nem previsão
        de êxito processual.
      </p>
    </aside>
  );
}
