# Plano de validação da fonte TJPR (HU-38)

Pré-requisito obrigatório antes de implementar `lib/providers/tjpr.ts` (§9/§14). Enquanto este
documento não estiver completo e revisado, o pipeline deve rodar exclusivamente em modo fixture
(`lib/providers/fixture.ts`, HU-37).

## Tentativa automatizada (feita nesta sessão)

- `WebFetch` para `https://portal.tjpr.jus.br/jurisprudencia/publico/` → **HTTP 404**.
- `WebFetch` para `https://portal.tjpr.jus.br/` (raiz do domínio) → **HTTP 404** também.
- Conclusão: o portal bloqueia ou não responde a requisições automatizadas sem navegador real
  (user-agent, JS rendering, ou WAF). Isso **confirma** a premissa do §9: o mapeamento do contrato
  de requisição não pode ser feito por fetch simples e exige inspeção manual via navegador
  (DevTools → aba Network), com uma pessoa autorizada navegando o portal normalmente.
- Nenhuma tentativa de contornar isso (headless browser, mudar user-agent, etc.) foi feita — seria
  uma violação da regra do §9 ("nunca substituir esta etapa por scraping ou automação de navegador
  para burlar login/CAPTCHA/limites").

## O que falta fazer manualmente (checklist para quem for validar)

1. Abrir `https://portal.tjpr.jus.br/jurisprudencia/publico/` (ou a URL correta, se essa já não
   existir — confirmar o caminho atual no site do TJPR) em um navegador normal.
2. Abrir DevTools → Network antes de fazer uma busca (ex.: termo "plano de saúde", conforme já
   testado manualmente segundo `contexto-geral.md` §4.2, que retornou 3.970 resultados).
3. Documentar, para a requisição de busca:
   - Método HTTP (GET ou POST).
   - Endpoint/URL completo e payload (query params ou body).
   - Parâmetros de paginação (tamanho de página observado: 20/50) e de filtros (período, órgão
     julgador, relator).
   - Formato da resposta (JSON? HTML renderizado no servidor?).
4. Documentar, para a página de uma decisão específica:
   - Quais campos aparecem: número do processo, órgão julgador, relator (quando houver), data,
     ementa/resumo, inteiro teor (quando disponível), URL pública estável.
5. Verificar termos de uso do portal, exigência de sessão/login, rate limits explícitos.
6. Salvar um exemplo real de resposta (sem dado privado) como fixture de referência.
7. **Se qualquer um dos itens acima indicar dependência de sessão, acesso restrito, ou uso não
   permitido pelos termos** → parar a integração real e manter o produto permanentemente em modo
   fixture (HU-37), documentando a decisão aqui.

## Status

**Pendente de inspeção manual.** Nenhum código de integração real (`TjprProvider`) deve ser escrito
até esta seção "Status" ser atualizada com o resultado da inspeção.
