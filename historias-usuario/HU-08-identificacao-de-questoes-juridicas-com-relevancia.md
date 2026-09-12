# HU-08 — Identificação de questões jurídicas com relevância

**Épico:** C — Case Understanding

**Como** advogado(a), **quero** que o sistema identifique as questões jurídicas centrais do meu
caso e sua relevância, **para** focar a pesquisa de jurisprudência no que realmente importa para a
tese. `[§3.2]`

**Regras de negócio**
- Cada `legalIssue` tem `id`, `topic`, `question` e `relevance: "HIGH"|"MEDIUM"|"LOW"`.
- Deve existir pelo menos uma questão jurídica extraída para o pipeline prosseguir. `[Critério de
  aceite 2, §12]`

**Validações**
- Rejeitar (erro de negócio) um `CaseAnalysis` com `legalIssues` vazio — sem questão jurídica não
  há o que pesquisar.

**Critérios de aceite**
- Dado um documento válido, quando analisado, então `legalIssues.length >= 1`.
- Dado um documento sem conteúdo jurídico reconhecível (ex.: um texto aleatório enviado por
  engano), quando analisado, então o sistema informa que não foi possível identificar questões
  jurídicas, em vez de gerar uma questão genérica sem base no texto.
