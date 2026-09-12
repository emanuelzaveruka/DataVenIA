# HU-38 — Plano de validação da fonte TJPR antes da integração real

**Épico:** L — Escopo, governança e demonstração

**Como** sistema/equipe técnica, **quero** documentar manualmente o contrato de requisição do
portal TJPR antes de codificar o adaptador, **para** garantir que a integração é tecnicamente
viável e compatível com os termos de uso do portal antes de depender dela. `[§9, §14]`

**Regras de negócio**
- Documentar: pesquisa e filtros usados; método HTTP (GET/POST); endpoint, payload, parâmetros de
  página e limite; campos retornados (órgão julgador, relator, data, ementa, inteiro teor, URL);
  existência de sessão/rate limit/termos de uso; uma resposta de exemplo salva como fixture sem
  dados privados. `[§9]`
- Se a investigação mostrar dependência de sessão, acesso restrito, ou uso não permitido pelos
  termos, a integração é interrompida e o produto permanece em modo fixture. `[§9]`

**Validações**
- Não implementar `lib/providers/tjpr.ts` antes desta documentação existir e ser revisada.

**Critérios de aceite**
- Dado que a investigação manual está concluída, quando revisada, então há um documento (ou
  fixture salva) suficiente para outro desenvolvedor implementar o adapter sem repetir a
  investigação.
