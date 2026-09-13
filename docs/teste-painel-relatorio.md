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

## Dois pontos que precisam da sua decisão

### 1. Vazamento de nome de parte (HU-05) — prioridade alta

O `FinalReport` da Sentença02 traz **o nome real da autora** em `caseSummary.parties.plaintiff`, e o
relatório inteiro saiu sem nenhum marcador de sanitização.

Causa: `sanitize.ts` procura nome seguido de bloco de qualificação ("Fulano, brasileira, casada,
portadora do RG..."). Nas sentenças do TJSP as partes vêm em cabeçalho tabular:

```
Requerente: Shirley da Silva Miranda
Requerido: Unimed de Marília Cooperativa de Trabalho Medico
```

Esse formato não casa com o padrão atual. **Não mexi no sanitizador** — é outro subsistema, e um
regex mal calibrado ali pode mascarar demais e estragar a análise. Mas é decisão sua e é rápida:
acrescentar um padrão para rótulos de cabeçalho (`Requerente:`, `Requerido:`, `Autor:`, `Réu:`,
`Exequente:`, `Executado:`).

Consequência prática enquanto não for feito: **o painel e o relatório exibem o nome real do cliente
na tela**. O CSV exportado **não** — ele só leva dados de jurisprudência, que são públicos.

Por isso também **não commitei nenhum dos três relatórios como fixture de teste**: colocaria o nome
de uma pessoa real no repositório. Os testes usam `buildDemoReport()`.

### 2. As sentenças são do TJSP, não do TJPR

As três são do Tribunal de Justiça de São Paulo, e são sentenças de 1º grau, não acórdãos. O produto
está escopado para TJPR (`docs/escopo.md`), e outro tribunal exige decisão explícita. Para testar o
painel isso não atrapalha — a peça de entrada pode ser de qualquer foro, é a jurisprudência buscada
que é TJPR.

## Rodar o pipeline sem navegador

```bash
node scripts/watch-run.mjs /caminho/para/peca.pdf --report
```

Mostra a execução etapa a etapa e imprime o `FinalReport` em JSON no fim.
