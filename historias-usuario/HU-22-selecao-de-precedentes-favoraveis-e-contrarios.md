# HU-22 — Seleção de precedentes favoráveis e contrários

**Épico:** H — Cross-File Analysis

**Como** advogado(a), **quero** que o sistema aponte tanto os precedentes que mais me ajudam quanto
os que mais me prejudicam, **para** preparar minha estratégia sabendo o que a outra parte pode
usar contra mim. `[§3.8, §4.2, Critério de aceite 9, §12]`

**Regras de negócio**
- O cross-file **deve** produzir `strongestSupporting[]` e `strongestOpposing[]` sempre que
  houver evidência para ambos — nunca omitir contrários para "parecer melhor" para o usuário.

**Validações**
- Se não houver nenhuma decisão contrária entre os Scratchpads válidos, o relatório deve declarar
  isso explicitamente ("nenhum precedente contrário identificado na amostra"), não silenciar o
  campo.

**Critérios de aceite**
- Dado um conjunto com 6 decisões favoráveis e 3 contrárias, quando analisado, então o relatório
  final apresenta as duas categorias, não apenas a favorável.
