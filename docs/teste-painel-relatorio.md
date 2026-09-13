# Como testar o painel de relatório

Branch: `feat/relatorio-real`. Nada foi para `main`.

```bash
npm run dev      # http://localhost:3000
```

## 1. Sem enviar nada — `/relatorio`

Abre lendo o **relatório de demonstração**. Ele não é mock: sai das Fases 6+7 de verdade sobre a
fixture versionada, sem rede e sem modelo. O cartão no topo diz que é demonstração.

Confira: KPIs, distribuição por câmara e por ano, as três abas (Precedentes / Questões / Relatores),
o filtro da tabela e o botão **Exportar precedentes (CSV)**.

## 2. Com uma peça real — o caminho que interessa

1. `/envio` → envie `Sentença02.pdf`
2. Espere ~25 s (roda OpenAI de verdade; a jurisprudência é fixture)
3. No cartão de resultado, clique em **Ver painel de números →**

O painel agora mostra o SEU relatório, com o nome do arquivo e o id da execução no cartão do topo.
O relatório vive em `sessionStorage` e é descartado ao fechar a aba (HU-06).

## O que esperar de cada sentença

Rodei as três antes de dormir. Os números abaixo são reais, não previsão:

| Arquivo | Assunto | Resultado |
|---|---|---|
| **Sentença02** | Tratamento médico-hospitalar (Unimed) | **Painel cheio** — 9 analisadas, 6 citações conferidas, 3 precedentes, 2 câmaras, 2 relatores, 2019–2023 |
| Sentença01 | Responsabilidade do fornecedor (implante) | Painel vazio, com explicação |
| Sentença03 | Serviços de saúde (dano estético) | Painel vazio, com explicação |

**As duas vazias não são bug.** A fixture de jurisprudência só cobre plano de saúde; 01 e 03 tratam
de vício de produto e responsabilidade hospitalar, então nenhuma decisão da amostra responde às
questões daquelas peças. A tela explica isso em vez de mostrar tabela vazia — e essa mensagem é o
comportamento correto do produto, porque a regra que produz o vazio é a mesma que impede citação
inventada. Some quando existir fonte real de jurisprudência (Fase 9, bloqueada em HU-38).

## Sanitização de nome de parte — corrigido

O relatório saía com o nome real da autora em `caseSummary.parties`. Causa: o sanitizador só
reconhecia parte apresentada com bloco de qualificação ("Fulana, brasileira, casada, portadora do
RG…"), que é o formato da **petição**. Sentença declara as partes em tabela de autuação
(`Requerente: Nome`), e por ali o nome passava intacto.

Corrigido em `e792e1e`. Três mudanças:

1. Novo padrão para o cabeçalho, com o próprio rótulo decidindo `[AUTOR]`/`[RÉU]`.
2. **Pessoa jurídica não é mascarada.** Empresa não é dado pessoal, e trocar "Unimed … Cooperativa"
   por `[RÉU]` cegaria o Case Understanding sobre do que o caso trata. Sem marcador de forma
   jurídica, o nome é mascarado — a falha é para o lado da privacidade.
3. A propagação pelo resto da peça deixou de ser troca literal. A Sentença01 grafa
   "Rosana Pantaroto Mesiano" no cabeçalho e "ROSANA PANTAROTO MESSIANO" no corpo — caixa diferente
   e um S a mais. Agora compara normalizado (sem acento, caixa ou letra repetida).

Conferido nas três: nome da autora zerado em todas, empresas e juízes preservados. Rodando o
pipeline completo na Sentença02, o relatório sai com `plaintiff: "[AUTOR]"` e nenhum traço do nome.

Juiz continua visível de propósito: não é parte, e é proveniência do documento.

## Tribunal da peça × tribunal pesquisado

O painel agora diz isso em vez de deixar implícito. A **peça** pode ser de qualquer foro; a
**jurisprudência** é só TJPR (HU-36). Quando os dois não coincidem — como nas suas três, do TJSP —
o cartão do topo avisa:

> Sua peça é do Tribunal de Justiça do Estado de São Paulo; a jurisprudência pesquisada é do TJPR.
> Os precedentes abaixo vêm do acervo paranaense e podem não refletir o entendimento do tribunal
> onde o seu processo corre.

Quando a peça é do Paraná (ou não identifica tribunal), aparece só "Jurisprudência pesquisada: TJPR,
único tribunal coberto pelo produto". Nada foi restringido: o produto continua aceitando peça de
qualquer tribunal.

## Rodar o pipeline sem navegador

```bash
node scripts/watch-run.mjs /caminho/para/peca.pdf --report
```

Mostra a execução etapa a etapa e imprime o `FinalReport` em JSON no fim.
