/**
 * HU-28 — aviso de apoio à pesquisa. Deliberadamente sem botão de fechar e sem estado: a validação
 * da HU exige que ele **não** seja dispensável nem some após a primeira visualização. Fica em um
 * componente único porque o mesmo texto exato (§7.2) tem que aparecer no upload e no resultado.
 *
 * Visual: superfície branca com a régua da marca à esquerda, não âmbar de alerta
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
      className={`rounded-card border border-vn-borda border-l-[3px] border-l-vn-acao bg-vn-superficie p-5 ${className}`}
    >
      <p className="text-apoio font-semibold text-vn-texto">
        Resultado de apoio à pesquisa. Confirme a fonte e realize revisão jurídica independente.
      </p>
      <p className="mt-1.5 text-rotulo leading-relaxed text-vn-texto-suave">
        A classificação é triagem de pesquisa jurisprudencial — não é parecer jurídico nem previsão
        de êxito processual.
      </p>
    </aside>
  );
}
