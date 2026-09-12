# HU-09 — Tratamento de documento pouco informativo

**Épico:** C — Case Understanding

**Como** advogado(a), **quero** ser avisado quando meu documento não tem conteúdo suficiente para
uma análise útil, **para** não receber um relatório vazio ou de baixa qualidade sem entender por
quê.

**Regras de negócio**
- Documento sem questões jurídicas extraíveis interrompe o pipeline em `PARTIAL_SUCCESS` ou
  `FAILED` com mensagem específica, não segue "de qualquer jeito" até o relatório final.

**Validações**
- Definir um limiar mínimo de conteúdo (ex.: contagem de caracteres úteis pós-sanitização) abaixo
  do qual o sistema já avisa antes de gastar uma chamada de Case Understanding.

**Critérios de aceite**
- Dado um TXT com poucas linhas sem conteúdo jurídico, quando enviado, então o usuário recebe uma
  mensagem explicando a limitação, em vez de um relatório fundamentado em nada.
