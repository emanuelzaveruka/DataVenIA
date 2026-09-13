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
  (b) **dashboard tabular de relatório** (`/relatorio` — **deixou de ser mock
  em 13/09/2026, ver entrada abaixo**; `/relatorio-demo` continua sendo a tela que confere
  HU-26/27/28 sobre a fixture); (c) **exportação
  DOCX/XLSX**, visível e desabilitada; (d) **filtros de escopo de busca** no envio (Câmara, Período),
  interativos mas não aplicados à busca. Nada disso altera o pipeline Map→Reduce→Verify nem o que vai
  ao relatório.

  Ligar qualquer um deles de verdade **exige decisão explícita** e muda contrato: (a) e (b) dependem
  de `listRuns` no repositório e de um view-model tabular sobre `FinalReport`; (d) depende de a rota
  aceitar `JurisprudenceQueryFilters` (`lib/schemas/search.schema.ts`, já tipado) e de `RunPipelineInput`
  repassá-los. Enquanto não estiverem ligados, cada tela diz que não está — filtro que aparenta filtrar
  e não filtra contradiz a postura de §7.2.

  **Não aceito**: os percentuais do protótipo ("Aderência 92%", "Favoráveis à tese — 66%", "Tendência:
  Favorável" por relator). §3.10/HU-29 proíbem expor score interno como probabilidade de êxito. Foram
  implementados como contagem absoluta com denominador visível e rótulo qualitativo, mantendo o
  layout. Reverter para percentual exigiria mudar a HU, não o CSS.

- **2026-09-13 — painel de números do relatório (implementado).** `/relatorio` passou a renderizar um
  `FinalReport` **real**: o da última análise da aba (guardado em `sessionStorage`, que morre com ela
  — HU-06) ou, na ausência dele, o relatório de demonstração, que também é real (Fases 6+7 sobre a
  fixture). A tela **diz qual dos dois está em cena**; nenhum número é inventado.

  A derivação vive em `lib/report/report-dashboard.ts`, função pura testada sem React: contagem por
  câmara, por relator, por ano, posição das citações, período coberto e as omissões de HU-27. Não
  altera o pipeline nem o `FinalReport` — só lê.

  **Regra que o módulo existe para não quebrar**: contagem absoluta com denominador visível, nunca
  razão, taxa ou score. §3.10/HU-29 proíbem sugerir probabilidade de êxito, e há teste que falha se
  qualquer campo de percentual aparecer no view-model.

  **Adição fora das 38 HUs**: exportação **CSV** da tabela de precedentes (processo, tribunal,
  câmara, relator, julgamento, posição, questão, fonte, citação). Exporta linhas, não agregados —
  contagem pronta fora do produto viajaria sem o disclaimer ao lado. DOCX/XLSX seguem no backlog.

  **Estado vazio é resultado, não erro**: quando a amostra não produz citação verificável, a tela diz
  que as N decisões foram lidas e nenhuma respondeu às questões — para quem decide entrar com a ação,
  "a jurisprudência disponível não fala sobre isso" é informação.

Ver também HU-38 (plano de validação da fonte TJPR) para os limites do que pode ser feito com o
portal público antes de qualquer decisão de integração real.
