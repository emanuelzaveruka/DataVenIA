# HU-04 — Feedback de progresso durante ingestão

**Épico:** A — Upload e ingestão do documento

**Como** advogado(a), **quero** ver o status do processamento do meu documento (recebido,
extraindo texto, sanitizando, analisando), **para** saber que o sistema está trabalhando em uma
tarefa que pode levar dezenas de segundos. `[§11.9, HU transversal com Épico J]`

**Regras de negócio**
- O progresso reflete o `WorkflowStage` real da state machine (§11.1), não um indicador genérico
  de "carregando".

**Validações**
- Nenhuma etapa deve ficar "presa" sem atualização de estado por mais que o timeout configurado
  para aquela etapa (ligado ao retry/circuit breaker, §11.4).

**Critérios de aceite**
- Dado um upload em andamento, quando o usuário observa a tela, então cada etapa concluída do
  pipeline (documento processado, N queries geradas, N candidatos encontrados etc.) é visível.
