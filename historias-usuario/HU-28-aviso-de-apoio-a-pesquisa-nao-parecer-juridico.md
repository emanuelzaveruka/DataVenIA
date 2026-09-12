# HU-28 — Aviso de apoio à pesquisa, não parecer jurídico

**Épico:** J — Relatório final

**Como** produto, **quero** exibir um aviso persistente de que o resultado é apoio à pesquisa e
exige revisão jurídica independente, **para** deixar claro que o sistema não promete resultado
processual nem substitui análise jurídica. `[§0.1, §7.2, Critério de aceite 17, §12]`

**Regras de negócio**
- Aviso: **"Resultado de apoio à pesquisa. Confirme a fonte e realize revisão jurídica
  independente."** deve aparecer tanto no upload quanto no resultado. `[§7.2, Critério de aceite
  17, §12]`
- A interface deve deixar claro que a classificação é triagem de pesquisa, não parecer nem
  previsão de êxito. `[§0.1]`

**Validações**
- O aviso não pode ser um texto dispensável que desaparece após a primeira visualização — deve
  permanecer visível/acessível na tela de resultado.

**Critérios de aceite**
- Dado que o usuário chega à tela de upload ou à tela de resultado, quando a página carrega,
  então o aviso está visível sem ação adicional do usuário.
