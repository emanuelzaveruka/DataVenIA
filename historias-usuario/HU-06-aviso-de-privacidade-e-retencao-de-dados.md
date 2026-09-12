# HU-06 — Aviso de privacidade e retenção de dados

**Épico:** B — Sanitização e privacidade

**Como** advogado(a), **quero** saber o que acontece com o conteúdo do documento que envio,
**para** decidir com segurança se posso usar o sistema com um caso real. `[§7.2]`

**Regras de negócio**
- Por padrão, dados de sessão são descartados ao encerrar a navegação, exceto o necessário para
  idempotência/cache de jurisprudência pública (que não contém dados do cliente). `[§7.2, §11.4]`
- O texto do documento do usuário nunca é usado para treinar modelos nem compartilhado além do que
  é necessário para gerar o relatório.

**Validações**
- A mensagem de privacidade deve ser exibida antes do upload ser efetivado, não apenas nos termos
  de uso genéricos.

**Critérios de aceite**
- Dado que o usuário chega à tela de upload, quando visualiza a página, então há aviso visível
  sobre sanitização e retenção de dados antes de enviar o arquivo.
