# Checklist de escopo (HU-36)

Referência rápida do §10 de `contexto-geral.md`. Antes de aceitar qualquer item novo no backlog,
verifique contra esta lista — expansão de escopo exige decisão explícita, nunca assumida por omissão.

## Dentro do escopo

- Upload de documento (PDF/DOCX/TXT) como única entrada do pipeline.
- Um único tribunal: TJPR.
- Busca pública de jurisprudência respeitando os limites do funil (§6).
- Pipeline completo Map → Reduce → Verify (Scratchpads, cross-file, evidence verification).
- Arquitetura de resiliência completa desde o início (§11): outputs estruturados validados,
  hooks PreToolUse/PostToolUse, contrato único de erro, retry+backoff, circuit breaker,
  idempotência, persistência estruturada.
- Dashboard de resultados, cards de decisão, links oficiais.
- Modo de demonstração com fixture versionada.
- UI responsiva/acessível, mobile-first.

## Fora do escopo (não implementar sem decisão explícita)

- Qualquer tribunal além do TJPR (STJ, STF, outros TJs).
- Scraping, automação de browser em massa, ou qualquer tentativa de burlar login/CAPTCHA/rate
  limit/áreas restritas.
- Previsão de resultado em percentual, cálculo de condenação, parecer jurídico formal, ou geração
  autônoma de peça pronta para protocolo sem revisão humana.
- Cadastro, pagamento, integração com CPJ/ProJuris, notificações, banco de dados multiusuário
  permanente.
- Comunica PJe/DJEN e DataJud como participantes ativos do pipeline (permanecem documentados como
  fontes complementares futuras).
- Análise de milhares de decisões simultâneas, Kafka, arquitetura distribuída, processamento em
  massa, fine-tuning, vector DB complexo, monitoramento contínuo de todos os processos, análise
  autônoma sem evidência.

## Adições por decisão explícita do usuário

Itens fora das 38 HUs originais, aceitos por decisão registrada (o que esta seção existe para
tornar rastreável — §10 exige decisão explícita, nunca por omissão).

- **2026-09-12 — dados de referência do TJPR em tabela própria.** Competência material das Câmaras
  (`camara_competencias`, já carregada) e contatos de desembargadores (a definir quando a planilha
  chegar). São dados públicos do tribunal, fora da árvore de execução e fora da cascata de HU-06.
  Não alteram o pipeline Map→Reduce→Verify nem o que vai ao relatório; servem a roteamento de
  matéria e consulta. Continua valendo o "fora do escopo" acima — em especial, nada aqui autoriza
  outro tribunal, coleta automatizada do portal, ou uso dos contatos para qualquer forma de envio.

- **2026-09-13 — telas novas de front, todas mockadas.** Redesign sobre o protótipo da equipe
  (`docs/PrototipoNovoFront/`). Quatro itens ficam **fora das 38 HUs** e entram como proposta visual,
  com aviso na própria tela e sem backend: (a) **histórico de pesquisas** (`/historico`, que substitui
  a tela "Acesso" do protótipo — a tela de login NÃO entra, cadastro segue fora do escopo acima);
  (b) **dashboard tabular de relatório** (`/relatorio`, com KPIs, distribuição, abas e filtros —
  `/relatorio-demo` continua sendo a tela que confere HU-26/27/28 sobre a fixture); (c) **exportação
  DOCX/XLSX**, visível e desabilitada; (d) **escopo de busca** no envio (termos, Câmara, Período) —
  **implementado em 13/09/2026, ver entrada abaixo**. Nada disso altera o pipeline Map→Reduce→Verify
  nem o que vai ao relatório.

  Ligar qualquer um deles de verdade **exige decisão explícita** e muda contrato: (a) e (b) dependem
  de `listRuns` no repositório e de um view-model tabular sobre `FinalReport`; (d) depende de a rota
  aceitar `JurisprudenceQueryFilters` (`lib/schemas/search.schema.ts`, já tipado) e de `RunPipelineInput`
  repassá-los. Enquanto não estiverem ligados, cada tela diz que não está — filtro que aparenta filtrar
  e não filtra contradiz a postura de §7.2.

  **Não aceito**: os percentuais do protótipo ("Aderência 92%", "Favoráveis à tese — 66%", "Tendência:
  Favorável" por relator). §3.10/HU-29 proíbem expor score interno como probabilidade de êxito. Foram
  implementados como contagem absoluta com denominador visível e rótulo qualitativo, mantendo o
  layout. Reverter para percentual exigiria mudar a HU, não o CSS.

- **2026-09-13 — escopo de busca definido pelo usuário (implementado).** Na tela de envio, escolher o
  arquivo dispara uma **pré-leitura** (`POST /api/documents/termos`) que devolve termos sugeridos; o
  usuário remove os que não servem, acrescenta os seus, e escolhe Câmara e período. Tudo segue junto
  com o arquivo numa requisição só — `RunPipelineInput` ganhou `extraTerms` e `filters`, ambos
  opcionais, e sem eles o pipeline roda exatamente como antes.

  **A pré-leitura não usa modelo**: é regex de citação legal (`art. 51 do CDC`, `Lei 9.656/1998`,
  `Súmula 608 do STJ`) mais frases curtas frequentes (`lib/services/document/suggest-terms.ts`).
  Determinística, instantânea e funciona sem credencial — mantém o critério de aceite 16. Ela roda
  **depois** da sanitização de HU-05, então nenhum dado pessoal pode virar termo de busca.

  **Por que isso não exige nenhuma regra nova de validação jurídica**: os termos do usuário **somam**
  às queries de `generateSearchQueries`, nunca as substituem. O conjunto do modelo continua inteiro,
  então a busca por jurisprudência contrária de HU-11 — e com ela a base de HU-22 — segue garantida
  independentemente do que o usuário apague na tela. Há teste amarrando isso
  (`lib/workflow/__tests__/run-pipeline.test.ts`).

  Fecha a contradição aberta desde a Fase 4: `SEARCH_RESULTS_EXCEED_CAP` já mandava "refine com
  período, órgão julgador ou relator" numa tela que não tinha como fazê-lo.

Ver também HU-38 (plano de validação da fonte TJPR) para os limites do que pode ser feito com o
portal público antes de qualquer decisão de integração real.
