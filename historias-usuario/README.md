# JurisFlow — Histórias de Usuário (HUs)

> Fonte de verdade de produto/arquitetura: `contexto-geral.md`. Este documento traduz aquele
> contexto em histórias de usuário implementáveis, com regras de negócio e validações. Onde uma
> HU decorre diretamente de uma seção do contexto, isso é referenciado como `[§x.x]`.
>
> Convenção: `Como <persona>, quero <ação>, para <benefício>.` Persona **Advogado(a)** é o usuário
> final. Persona **Sistema** é usada para comportamento interno obrigatório (não tem tela, mas é
> testável e afeta diretamente o que o Advogado(a) vê). Persona **Produto** cobre avisos/postura
> ética exigidos pelo edital.
>
> Prioridade: **MVP** (dentro do escopo do hackathon, §10) ou **Pós-MVP** (mencionado no contexto
> como evolução futura, fora do escopo atual).

---

## Índice de épicos e histórias

### Épico A — Upload e ingestão do documento

- [HU-01 — Upload de documento jurídico](./HU-01-upload-de-documento-juridico.md)
- [HU-02 — Validação de arquivo antes do processamento](./HU-02-validacao-de-arquivo-antes-do-processamento.md)
- [HU-03 — Extração de texto do documento (parsing)](./HU-03-extracao-de-texto-do-documento-parsing.md)
- [HU-04 — Feedback de progresso durante ingestão](./HU-04-feedback-de-progresso-durante-ingestao.md)

### Épico B — Sanitização e privacidade

- [HU-05 — Sanitização de dados pessoais antes de qualquer chamada a modelo](./HU-05-sanitizacao-de-dados-pessoais-antes-de-qualquer-chamada-a-modelo.md)
- [HU-06 — Aviso de privacidade e retenção de dados](./HU-06-aviso-de-privacidade-e-retencao-de-dados.md)

### Épico C — Case Understanding

- [HU-07 — Extração automática de fatos, partes e pedidos](./HU-07-extracao-automatica-de-fatos-partes-e-pedidos.md)
- [HU-08 — Identificação de questões jurídicas com relevância](./HU-08-identificacao-de-questoes-juridicas-com-relevancia.md)
- [HU-09 — Tratamento de documento pouco informativo](./HU-09-tratamento-de-documento-pouco-informativo.md)
- [HU-10 — Proteção contra prompt injection no conteúdo do documento](./HU-10-protecao-contra-prompt-injection-no-conteudo-do-documento.md)

### Épico D — Geração de queries de pesquisa

- [HU-11 — Geração de múltiplas queries de pesquisa com justificativa](./HU-11-geracao-de-multiplas-queries-de-pesquisa-com-justificativa.md)

### Épico E — Busca de jurisprudência no TJPR

- [HU-12 — Busca de jurisprudência pública no TJPR](./HU-12-busca-de-jurisprudencia-publica-no-tjpr.md)
- [HU-13 — Funil de limites na busca (evitar sobrecarga de resultados)](./HU-13-funil-de-limites-na-busca-evitar-sobrecarga-de-resultados.md)
- [HU-14 — Circuit breaker para instabilidade da fonte TJPR](./HU-14-circuit-breaker-para-instabilidade-da-fonte-tjpr.md)

### Épico F — Pré-ranking e seleção de candidatos

- [HU-15 — Pré-ranking de candidatos por relevância](./HU-15-pre-ranking-de-candidatos-por-relevancia.md)
- [HU-16 — Seleção limitada de decisões para análise profunda](./HU-16-selecao-limitada-de-decisoes-para-analise-profunda.md)

### Épico G — Scratchpad Files

- [HU-17 — Geração paralela e isolada de Scratchpad por decisão](./HU-17-geracao-paralela-e-isolada-de-scratchpad-por-decisao.md)
- [HU-18 — Classificação por proposição jurídica, não por decisão inteira](./HU-18-classificacao-por-proposicao-juridica-nao-por-decisao-inteira.md)
- [HU-19 — Sobrevivência a falha parcial na geração de Scratchpads](./HU-19-sobrevivencia-a-falha-parcial-na-geracao-de-scratchpads.md)
- [HU-20 — Retry com contexto do erro para Scratchpad inválido](./HU-20-retry-com-contexto-do-erro-para-scratchpad-invalido.md)

### Épico H — Cross-File Analysis

- [HU-21 — Análise cruzada de tendência jurisprudencial](./HU-21-analise-cruzada-de-tendencia-jurisprudencial.md)
- [HU-22 — Seleção de precedentes favoráveis e contrários](./HU-22-selecao-de-precedentes-favoraveis-e-contrarios.md)
- [HU-23 — Identificação de riscos e distinguishing factors](./HU-23-identificacao-de-riscos-e-distinguishing-factors.md)

### Épico I — Evidence Verification (anti-alucinação)

- [HU-24 — Verificação de evidências contra a fonte original](./HU-24-verificacao-de-evidencias-contra-a-fonte-original.md)
- [HU-25 — Bloqueio de afirmações sem evidência verificada (regra anti-alucinação)](./HU-25-bloqueio-de-afirmacoes-sem-evidencia-verificada-regra-anti-alucinacao.md)

### Épico J — Relatório final

- [HU-26 — Relatório estruturado com tendência jurisprudencial](./HU-26-relatorio-estruturado-com-tendencia-jurisprudencial.md)
- [HU-27 — Rastreabilidade de cada achado até a fonte oficial](./HU-27-rastreabilidade-de-cada-achado-ate-a-fonte-oficial.md)
- [HU-28 — Aviso de apoio à pesquisa, não parecer jurídico](./HU-28-aviso-de-apoio-a-pesquisa-nao-parecer-juridico.md)
- [HU-29 — Classificação indeterminada quando a evidência não basta](./HU-29-classificacao-indeterminada-quando-a-evidencia-nao-basta.md)

### Épico K — Resiliência e confiabilidade (transversal)

- [HU-30 — Máquina de estados do workflow com regras de transição](./HU-30-maquina-de-estados-do-workflow-com-regras-de-transicao.md)
- [HU-31 — Hooks de controle de ferramentas (PreToolUse / PostToolUse)](./HU-31-hooks-de-controle-de-ferramentas-pretooluse-posttooluse.md)
- [HU-32 — Contrato único de erro e política de retry](./HU-32-contrato-unico-de-erro-e-politica-de-retry.md)
- [HU-33 — Idempotência e reaproveitamento de processamento](./HU-33-idempotencia-e-reaproveitamento-de-processamento.md)
- [HU-34 — Persistência estruturada e auditável](./HU-34-persistencia-estruturada-e-auditavel.md)
- [HU-35 — Observabilidade de execução](./HU-35-observabilidade-de-execucao.md)

### Épico L — Escopo, governança e demonstração

- [HU-36 — Restrição a um único tribunal e a não-objetivos declarados](./HU-36-restricao-a-um-unico-tribunal-e-a-nao-objetivos-declarados.md)
- [HU-37 — Modo de demonstração com fixture versionada](./HU-37-modo-de-demonstracao-com-fixture-versionada.md)
- [HU-38 — Plano de validação da fonte TJPR antes da integração real](./HU-38-plano-de-validacao-da-fonte-tjpr-antes-da-integracao-real.md)

---

## Rastreabilidade — Critérios de aceite (§12) → HUs

| # | Critério de aceite (§12) | HU(s) |
| --- | --- | --- |
| 1 | Upload processado sem travar, telas pequena/grande | HU-01, HU-04 |
| 2 | Extrai ao menos 1 questão jurídica | HU-08 |
| 3 | Gera múltiplas queries de pesquisa | HU-11 |
| 4 | Pesquisa no TJPR respeitando funil de limites | HU-12, HU-13 |
| 5 | Seleciona no máximo `scratchpadLimit` decisões | HU-16 |
| 6 | Gera Scratchpad válido por decisão selecionada | HU-17, HU-18 |
| 7 | Sobrevive a falha de decisão individual | HU-19 |
| 8 | Realiza cross-file analysis sobre Scratchpads válidos | HU-21 |
| 9 | Seleciona precedentes favoráveis e contrários | HU-22 |
| 10 | Valida evidências contra o texto original | HU-24 |
| 11 | Relatório final com argumentos, riscos, distinguishing, estratégia | HU-26 |
| 12 | Cada precedente tem URL oficial e citação rastreável | HU-27 |
| 13 | Retry limitado + circuit breaker para o TJPR | HU-14, HU-32 |
| 14 | Erros seguem schema comum (`AppError`/`ToolResult`) | HU-32 |
| 15 | Nenhum relatório fundamentado em informação não verificada | HU-25 |
| 16 | Funciona em modo fixture sem conectividade externa | HU-37 |
| 17 | Aviso de revisão humana no upload e no resultado | HU-28 |
| 18 | Dados pessoais sanitizados antes de qualquer chamada a modelo | HU-05 |

---

## Próximo passo: seleção de stack e tecnologias

`contexto-geral.md` (§5) já fixa uma decisão de alto nível: **Next.js + TypeScript + Tailwind CSS**,
App Router e route handlers, projeto único, com Zod para validação estrutural. Isso cobre
front-end, camada de API e validação de contratos — não precisa ser rediscutido.

As decisões abaixo foram tomadas em 2026-09-12 e passam a valer como parte da spec (também
registradas em `contexto-geral.md` §15):

| Decisão | Escolha | Observação |
| --- | --- | --- |
| LLM para os agentes internos | **Múltiplos providers, via camada de abstração** | Nenhum agente (Case Understanding, Scratchpad, Cross-File, Evidence Verification) deve chamar um SDK de provider diretamente — todos passam por uma interface própria (`lib/llm/provider.ts`) com structured output validado por Zod (§11.7), independente do provider por trás. Aumenta esforço de engenharia frente ao prazo do hackathon, mas é coerente com a decisão já tomada de adotar a arquitetura de resiliência completa desde o início (§0.1, item 2) — risco assumido conscientemente. |
| Persistência (§11.8) | **Postgres (Neon/Supabase)** | Suporta JSONB nativamente para `decision_scratchpads.content` e demais tabelas; compatível com deploy serverless na Vercel. |
| Parsing de PDF/DOCX (§3.1) | **A decidir na implementação da HU-03** | Sem bloqueio de spec; escolher a lib ao codificar `lib/services/document/`. |
| Hospedagem | **Vercel** | Nativo para Next.js App Router; integra fácil com Postgres serverless. |

**Implicação de arquitetura**: a estrutura de diretórios do `contexto-geral.md` §5 ganha uma pasta
`lib/llm/` (interface `LlmProvider`, adaptadores por provider, seleção/configuração de modelo por
etapa do pipeline) — nenhum serviço (`case-analysis`, `scratchpad`, `cross-file`, `evidence`) importa
um SDK de modelo diretamente, todos dependem apenas da interface.
