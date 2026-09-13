/**
 * Fonte única dos textos de ajuda contextual ("?") da interface.
 *
 * Por que um arquivo de configuração e não texto solto no JSX: os mesmos termos aparecem no painel
 * de progresso, no relatório e em `public/como-funciona.html`. Escritos em três lugares, divergiriam
 * na primeira mudança de pipeline — e a explicação errada de uma etapa é pior do que nenhuma.
 * `lib/config/__tests__/glossary.test.ts` amarra os três.
 *
 * Regras de redação (§7.2/HU-28, docs/identidade-visual.md §4):
 * - português de advogado, não de desenvolvedor: nada de "schema", "provider", "array";
 * - nenhum texto aqui sugere êxito processual, probabilidade ou percentual de chance;
 * - "não produziu nada" nunca é escrito como defeito — na maior parte das vezes é a regra
 *   anti-alucinação funcionando, e o usuário precisa ler isso como informação, não como erro.
 */

export interface GlossaryEntry {
  /** O rótulo exatamente como aparece na tela — é o que o teste compara com a UI. */
  term: string;
  /** O que esta parte do processo é ou faz. Uma a três frases. */
  what: string;
  /** O que significa a etapa ter terminado com zero (só nas etapas contáveis). */
  empty?: string;
  /** O que significa a etapa não ter sido alcançada. */
  pending?: string;
  /** O que significa a execução ter parado nesta etapa. */
  failed?: string;
}

const NOT_REACHED = "A execução parou antes de chegar aqui — o motivo aparece na mensagem de erro acima.";

export const GLOSSARY = {
  // ---------------------------------------------------------------------------
  // As oito etapas do painel de progresso, na ordem de `buildPipelineProgress`.
  // ---------------------------------------------------------------------------
  documentoProcessado: {
    term: "Documento processado",
    what:
      "Seu arquivo foi validado, teve o texto extraído (PDF, DOCX ou TXT) e passou pela máscara de dados pessoais: CPF/CNPJ, endereços, telefones, e-mails e nomes são substituídos por marcadores antes de qualquer análise. O texto original nunca é gravado nem enviado a um modelo.",
    failed:
      "O arquivo não pôde ser lido. Normalmente é um PDF só de imagem (digitalizado sem texto selecionável), um arquivo corrompido ou um formato fora de PDF/DOCX/TXT.",
  },
  queriesGeradas: {
    term: "Queries de pesquisa geradas",
    what:
      "A partir das questões jurídicas encontradas no seu documento, o sistema monta várias buscas diferentes — nunca uma só. Por exigência do produto, pelo menos uma delas procura jurisprudência CONTRÁRIA à sua tese: você precisa ver o que pode derrubar o argumento, não apenas o que o confirma.",
    empty: "Nenhuma busca foi montada — o documento não trouxe questão jurídica reconhecível.",
    pending: NOT_REACHED,
  },
  candidatosEncontrados: {
    term: "Candidatos encontrados",
    what:
      "Total de acórdãos do TJPR que as buscas devolveram, já sem repetições. Se uma busca devolver mais de 150 resultados ela é interrompida e o sistema pede filtros, em vez de analisar uma amostra aleatória de um universo grande demais.",
    empty:
      "As buscas rodaram e o TJPR não devolveu nenhum acórdão. Costuma indicar tese muito específica ou termos que não aparecem na jurisprudência do tribunal.",
    pending: NOT_REACHED,
  },
  decisoesSelecionadas: {
    term: "Decisões selecionadas para análise profunda",
    what:
      "Dos candidatos, no máximo 10 seguem para leitura integral. A escolha combina relevância (semelhança de tema, mesma Câmara, mesmo relator, data) com diversidade: a seleção alterna entre Câmaras de propósito, para o resultado não refletir a posição de um único colegiado.",
    empty: "Nenhuma decisão passou pelo corte de relevância.",
    pending: NOT_REACHED,
  },
  scratchpadsValidos: {
    term: "Scratchpads válidos",
    what:
      "Um Scratchpad é a ficha de análise de UMA decisão, lida isoladamente das demais. Cada proposição jurídica da decisão recebe sua própria posição — favorável, contrária, neutra ou mista — porque um mesmo acórdão costuma acolher uma tese e rejeitar outra. São necessárias pelo menos 3 fichas válidas para o relatório seguir adiante.",
    empty:
      "Nenhuma decisão produziu ficha confiável. Em vez de um relatório fundamentado em análise fraca, a execução para aqui.",
    pending: NOT_REACHED,
    failed:
      "Menos de 3 decisões produziram ficha válida — abaixo disso o conjunto não sustenta uma leitura de tendência, e o relatório não é montado.",
  },
  analiseCruzada: {
    term: "Análise cruzada concluída",
    what:
      "As fichas são confrontadas entre si para achar o padrão do órgão julgador em cada questão do seu caso: o que se repete, o que diverge, quais decisões sustentam e quais contrariam. Esta etapa lê apenas as fichas — nunca o seu documento nem o texto integral dos acórdãos.",
    pending: NOT_REACHED,
    failed: "O confronto entre as fichas não pôde ser concluído.",
  },
  evidenciasVerificadas: {
    term: "Evidências verificadas na fonte oficial",
    what:
      "Cada trecho que o relatório pretende citar é reaberto na decisão original do TJPR e comparado com o texto real. Só é exibido o que confere. É a etapa que impede citação inventada: quem afirma tem de mostrar onde está escrito.",
    empty:
      "A etapa rodou e nenhum trecho conferiu. Ou nada bateu com o texto original, ou a decisão mudou no portal depois de ter sido coletada. Nada desapareceu em silêncio: cada item barrado fica listado no relatório, em “Ver o que foi omitido e por quê”.",
    pending: NOT_REACHED,
    failed: "Não foi possível reabrir as decisões no portal do TJPR para conferir as citações.",
  },
  relatorioPronto: {
    term: "Relatório pronto",
    what:
      "O relatório é montado sem nenhuma chamada de modelo: tudo o que ele exibe já foi estruturado e conferido nas etapas anteriores. Uma última escrita por IA aqui reintroduziria exatamente a invenção que a verificação acabou de eliminar.",
    pending: NOT_REACHED,
    failed: "A consolidação do relatório não foi concluída.",
  },

  // ---------------------------------------------------------------------------
  // Card de execução.
  // ---------------------------------------------------------------------------
  scratchpadsRatio: {
    term: "Scratchpads",
    what:
      "Quantas decisões foram analisadas com sucesso, de quantas foram tentadas. Falha em uma decisão não derruba a execução: o pipeline segue com as demais, desde que sobrem pelo menos 3 fichas válidas. O número de falhas fica à vista justamente para você saber sobre que amostra o relatório foi escrito.",
  },
  execucaoLinha: {
    term: "Execução",
    what:
      "Identificador desta análise, seguido do modelo de IA que a processou. O identificador é o que amarra documento, buscas, fichas, citações e erros na mesma linha do tempo — é por ele que se reconstrói, depois, como cada conclusão foi obtida.",
  },
  fonteJurisprudencia: {
    term: "jurisprudência",
    what:
      "De onde vieram os acórdãos. “fixture” é o acervo fictício versionado do projeto, usado em demonstração: roda sem internet e sem custo, com decisões que não existem. “tjpr” é o portal público real — e, se ele estiver indisponível, a execução cai para o acervo de demonstração dentro da mesma chamada, sempre declarando isso aqui.",
  },

  // ---------------------------------------------------------------------------
  // Jargão do relatório.
  // ---------------------------------------------------------------------------
  distinguishing: {
    term: "Distinguishing",
    what:
      "Fatos que afastam o caso analisado do seu. É a técnica de distinguir precedentes: serve tanto para você antecipar como a parte contrária vai tentar afastar um acórdão favorável, quanto para afastar um desfavorável.",
  },
  indeterminada: {
    term: "Indeterminada",
    what:
      "Classificação de primeira classe, não uma falha: significa que a amostra analisada não autoriza afirmar tendência nenhuma — por serem poucas decisões, ou por nenhuma citação ter sido confirmada na fonte. O motivo exato vem na linha logo abaixo. Forçar um lado quando a base não sustenta seria o mesmo que inventar.",
  },
  convergencia: {
    term: "Leitura",
    what:
      "Quão alinhadas entre si estão as decisões analisadas. Vem sempre acompanhada da contagem absoluta (“6 de 10 decisões sustentam a tese”). Não existe percentual, nota ou probabilidade de êxito: o produto é proibido de estimar quem ganha, e o cálculo interno que escolhe este rótulo nunca é exibido.",
  },
  citacaoConferida: {
    term: "conferida(s) na fonte original",
    what:
      "Citações cujo texto foi reaberto na decisão do TJPR e bateu com o original. Nenhum trecho chega ao relatório sem passar por isso, e cada um traz processo, Câmara, relator, data e link para o portal oficial.",
  },
  omissoes: {
    term: "omitido(s) por falta de verificação",
    what:
      "Achados que a análise produziu mas o relatório não exibe: citação que não conferiu na fonte, item sem Câmara/relator/data, link fora do portal oficial do TJPR, ou frase que expressava probabilidade de ganho. Ficam listados um a um, com o motivo — o relatório precisa conseguir responder também por que algo não aparece.",
  },
} as const satisfies Record<string, GlossaryEntry>;

export type GlossaryKey = keyof typeof GLOSSARY;

/** As oito entradas das etapas, na mesma ordem de `buildPipelineProgress`. */
export const PROGRESS_GLOSSARY_KEYS = [
  "documentoProcessado",
  "queriesGeradas",
  "candidatosEncontrados",
  "decisoesSelecionadas",
  "scratchpadsValidos",
  "analiseCruzada",
  "evidenciasVerificadas",
  "relatorioPronto",
] as const satisfies readonly GlossaryKey[];
