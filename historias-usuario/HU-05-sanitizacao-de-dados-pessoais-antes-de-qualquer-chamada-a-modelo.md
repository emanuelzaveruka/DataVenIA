# HU-05 — Sanitização de dados pessoais antes de qualquer chamada a modelo

**Épico:** B — Sanitização e privacidade

**Como** sistema, **quero** detectar e mascarar dados pessoais identificáveis (nome de partes não
essenciais, CPF/CNPJ, endereço, telefone, e-mail) no texto extraído, **para** reduzir exposição de
dados sensíveis de clientes reais antes de qualquer envio a um modelo de IA. `[§7.3 — gap
identificado na consolidação]`

**Regras de negócio**
- Esta etapa é **bloqueante**: Case Understanding não roda sobre texto não sanitizado. `[§7.3]`
- O que é estritamente necessário à análise jurídica (fatos, teses, pedidos, referências legais)
  deve ser preservado; apenas identificadores pessoais não essenciais são mascarados.
- A sanitização ocorre localmente (antes de sair do parsing), não como um segundo agente externo
  que também veria os dados brutos.

**Validações**
- CPF/CNPJ devem ser reconhecidos mesmo com formatação variada (pontuação, espaços).
- Nomes de partes citados apenas para identificação (não relevantes à tese) devem ser
  substituídos por um marcador estável (ex.: `[AUTOR]`, `[RÉU]`) para preservar a coerência do
  texto sem expor o dado.
- Falha da sanitização (ex.: detector indisponível) deve impedir o avanço do pipeline, não
  degradar silenciosamente para "enviar sem sanitizar".

**Critérios de aceite**
- Dado um documento contendo CPF e endereço do cliente, quando processado, então nenhum desses
  dados aparece no payload enviado ao modelo de Case Understanding. `[Critério de aceite 18, §12]`
- Dado que a sanitização falha, quando isso ocorre, então o pipeline não avança para Case
  Understanding e o erro é reportado ao usuário.
