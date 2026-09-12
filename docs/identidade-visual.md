# Identidade visual — Data VênIA

Fonte desta identidade: `docs/images/WhatsApp Image 2026-09-12 at 12.01.08.jpeg` (logo horizontal).
Todas as cores abaixo foram **amostradas do arquivo**, não estimadas, e todos os contrastes foram
**medidos** pela fórmula WCAG 2.1 — os números estão na tabela, para que ninguém precise confiar em
"parece acessível".

> **Nomenclatura.** O produto se chama **Data VênIA** em todo texto visível ao usuário e em toda a
> documentação. Em identificador de código e no `name` do `package.json` a forma é **`DataVenia`**
> / **`datavenia`** — sem acento e sem espaço, que não cabem nesses lugares (ex.: a interface
> `DataVeniaRepository`). O nome anterior, JurisFlow, foi substituído em 2026-09-12.

## 1. O nome

**Data VênIA** é um trocadilho de três camadas, e a identidade inteira se apoia nele:

- *data venia* — "com a devida vênia", a fórmula de respeito com que se discorda no discurso
  jurídico brasileiro;
- *data* — o dado, a decisão pública, a evidência verificada;
- *IA* — grafado em verde no logo, destacando o terceiro termo.

A postura do produto (§7.2, HU-28) é literalmente essa: **apresentar o que a jurisprudência diz,
com a devida vênia, sem afirmar quem ganha.** A identidade não deve contradizer isso em nenhum
ponto — é o que motiva a regra da seção 4.

## 2. Cores da marca

Amostradas do logo. O navy ocupa 74,5% do arquivo; é a cor-assinatura.

| Token | Hex | Papel |
| --- | --- | --- |
| `brand-navy` | `#10243D` | Fundo-assinatura, superfície do tema escuro, tinta do tema claro |
| `brand-cream` | `#F4F1EA` | Papel do tema claro, tinta do tema escuro |
| `brand-green` | `#0E9165` | Marca gráfica: o "V", o "IA", foco, realce **não-textual** |

**`brand-navy` sobre `brand-cream` mede 13,87:1** — AAA com folga larga nos dois sentidos. O par
principal do produto não tem nenhum problema de legibilidade.

### O verde não é cor de texto

`brand-green` mede **3,54:1 sobre cream** e **3,92:1 sobre navy**. Passa em 3:1 (elemento gráfico,
WCAG 1.4.11), **reprova em 4,5:1 (texto)**. Então o verde da marca pinta o logo, o anel de foco e
bordas de destaque — nunca uma frase. Para texto existem duas variantes derivadas:

| Token | Hex | Sobre | Medido |
| --- | --- | --- | --- |
| `green-ink` | `#0B6E4D` | cream | **5,55:1** AA |
| `green-light` | `#2DD4A0` | navy | **8,23:1** AAA |

## 3. Neutros

Rampa gerada por interpolação `brand-navy → brand-cream`, então todo cinza do produto é
levemente tingido de azul e nada "suja" ao lado da marca. Substitui o `neutral-*` do Tailwind que
a UI usa hoje.

| Token | Hex | Sobre cream | Sobre navy | Uso |
| --- | --- | --- | --- | --- |
| `ink-900` | `#10243D` | 13,87:1 AAA | — | Texto principal (claro) / fundo (escuro) |
| `ink-800` | `#22344B` | 11,21:1 AAA | — | Superfície elevada (escuro) |
| `ink-700` | `#39495C` | 8,16:1 AAA | — | Texto forte (claro) |
| `ink-600` | `#5E6A78` | 4,89:1 AA | — | **Texto secundário (claro) — o menor que ainda passa AA** |
| `ink-500` | `#828A94` | 3,10:1 | 4,48:1 | **Borda de campo nos dois temas** (≥3:1, WCAG 1.4.11) |
| `ink-400` | `#A6ABAF` | — | 6,76:1 AA | Texto secundário (escuro) |
| `ink-300` | `#C6C8C7` | — | 9,31:1 AAA | Divisória decorativa (claro) |
| `ink-200` | `#DDDCD9` | — | 11,41:1 AAA | Superfície sutil (claro) |
| `ink-100` | `#EBE9E3` | — | 12,89:1 AAA | Fundo de bloco (claro) |
| `ink-050` | `#F4F1EA` | — | 13,87:1 AAA | Papel (claro) / texto (escuro) |

Duas armadilhas que a medição expôs:

- **`ink-500` é o piso de texto secundário no claro** — `text-neutral-500`, hoje o utilitário mais
  usado da UI (17 ocorrências), equivale a ~3,1:1 e **reprova em AA**. A substituição correta é
  `ink-600`, não um cinza de mesmo número.
- **`ink-300` não serve de borda de campo** (1,49:1 sobre cream). Divisória decorativa pode; a
  borda de um `input` é fronteira de componente e precisa de 3:1 → `ink-500`.

## 4. A regra que manda em tudo: cor não valora resultado

O produto é proibido de sugerir êxito (§3.10, HU-29: sem percentual, sem "chance de ganhar").
Pintar *precedente favorável* de verde e *contrário* de vermelho reintroduz exatamente esse
julgamento — por baixo do texto, onde nenhuma regra de conteúdo alcança. Some-se que o verde é a
cor da marca: verde = favorável faria a identidade inteira torcer por um lado.

Então **a classificação jurídica usa uma paleta categórica, não uma escala de aprovação**:

| Classificação | Claro (sobre cream) | Medido | Escuro (sobre navy) | Medido | Forma |
| --- | --- | --- | --- | --- | --- |
| Sustenta a tese | `#1A5694` azul | 6,64:1 AA | `#93C5FD` | 8,68:1 AAA | ● círculo |
| Contrária | `#5B4394` roxo | 6,96:1 AA | `#C4B5FD` | 8,48:1 AAA | ■ quadrado |
| Mista | `#14636B` teal | 6,15:1 AA | `#7DD3DC` | 9,11:1 AAA | ◆ losango |
| Indeterminada | `ink-600` | 4,89:1 AA | `ink-400` | 6,76:1 AA | ○ contorno |

Azul, roxo e teal não carregam valência cultural de bom/ruim como verde e vermelho carregam, e
ficam fora do vermelho/âmbar reservado a estado de sistema (seção 5) — um precedente contrário
nunca deve parecer um erro da aplicação.

### Por que a forma é obrigatória, não decorativa

Medi o contraste do trio **entre si**: **1,05:1, 1,08:1 e 1,13:1**. Eles têm luminância
praticamente idêntica e se distinguem *só* por matiz. Em escala de cinza, ou para quem tem
deficiência severa de visão de cores, os três chips são o mesmo chip.

Isso é intencional — luminância pareada é o que os mantém com o mesmo peso visual, sem nenhum
parecendo "mais forte". O preço é que **cor sozinha não identifica classificação em hipótese
alguma**: todo chip carrega rótulo textual *e* forma. É a exigência que `app/report-view.tsx` já
cumpre ("cor nunca como único portador de significado"); aqui ela vira número.

## 5. Cores de sistema

Separadas das de classificação, de propósito: erro de aplicação e precedente contrário são coisas
diferentes e nunca devem se parecer.

| Estado | Claro | Medido | Escuro | Medido |
| --- | --- | --- | --- | --- |
| Erro | `#B4341F` | 5,39:1 AA | `#FCA5A5` | 8,25:1 AAA |
| Alerta / aviso | `#92400E` | 6,29:1 AA | `#FBBF7A` | 9,57:1 AAA |
| Sucesso (operação) | `green-ink` `#0B6E4D` | 5,55:1 AA | `green-light` `#2DD4A0` | 8,23:1 AAA |

"Sucesso" aqui é **sempre operacional** — documento processado, execução persistida. Nunca
resultado jurídico.

## 6. Foco

`brand-green` como anel de foco nos dois temas: **3,54:1 no claro e 3,92:1 no escuro**, ambos
acima dos 3:1 exigidos para indicador não-textual. É o único lugar em que o verde da marca aparece
sozinho na interface, e funciona sem troca por tema — anel de 2px com 2px de deslocamento.

## 7. Tipografia

O wordmark é uma **sans geométrica de `a` de andar único**, bojos circulares e terminais retos —
família Futura/Century Gothic. Poppins é o equivalente livre mais próximo; **é uma aproximação
visual, não a fonte confirmada do arquivo original.**

| Papel | Família | Onde |
| --- | --- | --- |
| Marca / títulos | Poppins (500, 600) | Wordmark, `h1`, `h2` |
| Interface e leitura | Inter (400, 500, 600) | Todo o resto |
| Citação de decisão | Inter, itálico | Trechos de ementa e inteiro teor |

Poppins tem `x-height` baixo e espaçamento largo: excelente em 3 palavras, cansativo em um
relatório. A divisão é deliberada — a marca aparece nos títulos, a leitura fica com a Inter.

Carregar via `next/font/google` em `app/layout.tsx` (auto-host, sem requisição a terceiros em
runtime).

**Escala** (`rem`, base 16px): 2,25 / 1,75 / 1,375 / 1,125 / 1 / 0,875 / 0,75. Corpo de relatório
nunca abaixo de 1rem; `0,75rem` só para metadado de proveniência.

## 8. Tokens

Para `app/globals.css` (Tailwind v4 — `@theme` gera `bg-*`, `text-*`, `border-*` automaticamente):

```css
@import "tailwindcss";

@theme {
  --color-brand-navy: #10243D;
  --color-brand-cream: #F4F1EA;
  --color-brand-green: #0E9165;
  --color-green-ink: #0B6E4D;
  --color-green-light: #2DD4A0;

  --color-ink-900: #10243D;
  --color-ink-800: #22344B;
  --color-ink-700: #39495C;
  --color-ink-600: #5E6A78;
  --color-ink-500: #828A94;
  --color-ink-400: #A6ABAF;
  --color-ink-300: #C6C8C7;
  --color-ink-200: #DDDCD9;
  --color-ink-100: #EBE9E3;
  --color-ink-050: #F4F1EA;

  --color-stance-supports: #1A5694;
  --color-stance-opposes: #5B4394;
  --color-stance-mixed: #14636B;
  --color-stance-supports-dark: #93C5FD;
  --color-stance-opposes-dark: #C4B5FD;
  --color-stance-mixed-dark: #7DD3DC;

  --color-danger: #B4341F;
  --color-danger-dark: #FCA5A5;
  --color-warn: #92400E;
  --color-warn-dark: #FBBF7A;
}
```

## 9. Migração da UI — **aplicada**

A UI usava `neutral-*`, `amber-*`, `red-*` e `emerald-*` do Tailwind. A migração está feita: não há
mais nenhuma classe de cor nativa do Tailwind em `app/`. Mapeamento aplicado:

| Hoje | Vira | Observação |
| --- | --- | --- |
| `text-neutral-500` | `text-ink-600` / `dark:text-ink-400` | **Corrige reprovação de AA** |
| `text-neutral-900` | `text-ink-900` | |
| `bg-neutral-100` | `bg-ink-100` | |
| `bg-neutral-900` | `bg-brand-navy` | |
| `border-neutral-300` | `border-ink-500` | Em `input`; `ink-300` só em divisória |
| `bg-emerald-*` / `text-emerald-*` | `green-ink` / `green-light` | **Só se for estado operacional** |
| `amber-*` (disclaimer) | `warn` | Ver abaixo |
| `red-*` | `danger` | |

**O disclaimer de HU-28 era o caso mais delicado.** Era âmbar, a mesma cor de alerta do sistema —
mas ele não é um alerta: é a postura permanente do produto, e a HU exige que não seja dispensável.
Em âmbar, lia como aviso transitório que o usuário aprende a ignorar. Agora é superfície
institucional (`ink-100` / `ink-800`) com **barra lateral `brand-green`**, o único lugar da
interface, além do foco, em que a cor da marca aparece sozinha.

Duas medições guiaram a execução:

- **Painel e página têm 1,08:1 entre si** (`ink-100` vs `cream`) — o preenchimento não delimita
  nada sozinho, então todo painel leva borda. Sem ela, o bloco simplesmente some do fundo.
- **Texto sobre painel**: `ink-900` sobre `ink-100` mede 12,89:1 e `ink-600` sobre `ink-100` mede
  4,54:1 — o secundário passa AA por margem estreita, e `ink-500` no lugar dele reprovaria.

**O âmbar sobrevive em um lugar só**, como `warn`: `conclusionBlockedReason`, a mensagem de
conclusão bloqueada por falta de evidência verificada. É estado de sistema (a regra
anti-alucinação agindo), não classificação jurídica — e fica visualmente distante dos chips
justamente por isso. Mede 6,29:1 sobre cream e 9,57:1 sobre navy.

**`StatusDot` ganhou forma e texto acessível.** Verde/vermelho ali são legítimos (estado
operacional, seção 5), mas *concluída* e *pendente* se distinguiam só pela cor de uma bolinha de
2px — o rótulo ao lado nomeia a etapa, não o estado. Agora preenchida vs. contorno, com
`aria-label`.

## 10. Uso do logo

- **Área de proteção:** a largura do "V" em todos os lados.
- **Tamanho mínimo:** 120px de largura (abaixo disso, só o "V").
- **Fundo:** o logo nasce sobre `brand-navy`. Sobre cream, usar a versão de tinta navy — nunca o
  arquivo original com fundo recortado.
- **Proibido:** recolorir, aplicar sombra/gradiente, esticar, ou separar "Data" de "VênIA".
- O arquivo atual é **JPEG 1600×320 com fundo chapado**. Para a UI é preciso **SVG** (ou ao menos
  PNG com alfa): JPEG não tem transparência e vai carregar um retângulo navy para dentro de
  qualquer fundo claro.

## 11. Checklist de acessibilidade

- [ ] Texto ≥ 4,5:1; texto grande (≥24px, ou ≥19px bold) ≥ 3:1
- [ ] Borda de campo e anel de foco ≥ 3:1 contra o fundo adjacente
- [ ] Toda classificação com **rótulo textual + forma**, nunca cor sozinha
- [ ] Foco visível em todo elemento interativo, sem `outline: none` sem substituto
- [ ] Hierarquia semântica de heading sem salto de nível
- [ ] Alvo de toque ≥ 44×44px
- [ ] Legível a 200% de zoom sem rolagem horizontal
- [ ] Disclaimer de HU-28 presente e não dispensável

## Pendências

1. **Logo em SVG** — o JPEG de fundo chapado não serve para a interface. Enquanto não existir, o
   logo não entra na UI: hoje o cabeçalho é texto.
2. **Tipografia não aplicada** — Poppins/Inter estão especificados (seção 7) mas ainda não
   carregados via `next/font/google` em `app/layout.tsx`. A UI usa a fonte padrão do sistema.
3. **Fonte do wordmark** — Poppins é aproximação; confirmar com quem desenhou o logo.

~~Disclaimer fora do âmbar~~ — feito, seção 9.
~~Nome do produto~~ — feito: JurisFlow → Data VênIA em código, páginas e documentação.
