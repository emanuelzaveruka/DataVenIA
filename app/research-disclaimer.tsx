/**
 * HU-28 — aviso de apoio à pesquisa. Deliberadamente sem botão de fechar e sem estado: a validação
 * da HU exige que ele **não** seja dispensável nem some após a primeira visualização. Fica em um
 * componente único porque o mesmo texto exato (§7.2) tem que aparecer no upload e no resultado.
 *
 * Visual: superfície institucional (ink) com barra da marca, não âmbar de alerta
 * (docs/identidade-visual.md §9). Em âmbar ele lia como aviso transitório — exatamente o que o
 * usuário aprende a ignorar, e o oposto do que a HU pede. A barra `brand-green` é o único lugar da
 * interface em que a cor da marca aparece sozinha além do foco, e marca isto como postura
 * permanente do produto. Fundo de painel e fundo de página têm só 1,08:1 entre si, então a borda
 * é o que delimita o bloco — não o preenchimento.
 */
export function ResearchDisclaimer({ className = "" }: { className?: string }) {
  return (
    <aside
      role="note"
      aria-label="Aviso sobre o uso do resultado"
      className={`rounded-lg border border-ink-300 border-l-4 border-l-brand-green bg-ink-100 p-3 text-sm text-ink-900 dark:border-ink-700 dark:border-l-brand-green dark:bg-ink-800 dark:text-ink-050 ${className}`}
    >
      <p className="font-medium">
        Resultado de apoio à pesquisa. Confirme a fonte e realize revisão jurídica independente.
      </p>
      <p className="mt-1 text-xs text-ink-600 dark:text-ink-400">
        A classificação é triagem de pesquisa jurisprudencial — não é parecer jurídico nem previsão
        de êxito processual.
      </p>
    </aside>
  );
}
