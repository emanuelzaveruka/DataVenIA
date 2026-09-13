/**
 * Indicadores do relatório — quando um número pode ser mostrado, e de que forma.
 *
 * Regras da analista (13/09/2026), que valem igual na tela e no PDF. Elas existem porque o mesmo
 * número significa coisas diferentes conforme o tamanho da amostra: "2 de 3 sustentam a tese" lido
 * como 67% sugere uma solidez que três decisões não sustentam.
 *
 * | Base analisada | O que aparece                                  |
 * | -------------- | ---------------------------------------------- |
 * | menos de 3     | nada — o indicador não é exibido               |
 * | 3 a 7          | só a contagem absoluta                         |
 * | 8 a 19         | contagem + percentual, com aviso de base curta |
 * | 20 ou mais     | contagem + percentual                          |
 *
 * ## Por que o percentual deixou de ser proibido
 *
 * §3.10/HU-29 proíbem o produto de sugerir **probabilidade de êxito**. Percentual de amostra não é
 * isso: "65% dos 23 acórdãos analisados sustentam a tese" é fato verificável sobre o que foi lido,
 * não previsão sobre o que o juiz fará. A distinção some quando o número aparece sozinho, e é
 * exatamente por isso que `textoIndicador` **sempre** escreve o denominador e a palavra "analisados"
 * junto — o percentual nunca viaja desacompanhado.
 *
 * Decisão registrada em `docs/escopo.md`. Antes desta regra o produto só exibia contagem absoluta.
 *
 * ## O que NÃO é estimado
 *
 * Indicador sem dado de origem não aparece, e não é preenchido com zero nem com média (I-10, I-11,
 * I-13). Zero e "não sei" são leituras opostas: a primeira diz que a busca olhou e não achou, a
 * segunda diz que ninguém olhou. Por isso `dadoAusente()` é um estado próprio, distinto de
 * `amostraInsuficiente`.
 */

/** Fronteiras da escala. Nomeadas porque aparecem em teste e em texto de aviso. */
export const MIN_PARA_EXIBIR = 3;
export const MIN_PARA_PERCENTUAL = 8;
export const MIN_SEM_AVISO = 20;

export type MotivoOculto = "AMOSTRA_INSUFICIENTE" | "DADO_AUSENTE";

/** Extraído do union para que quem devolve "oculto" possa prometer isso no tipo. */
export interface IndicadorOculto {
  exibir: false;
  motivo: MotivoOculto;
  total: number;
}

export type Indicador =
  | IndicadorOculto
  | {
      exibir: true;
      valor: number;
      total: number;
      /** Ausente de propósito quando a base é de 3 a 7: não é zero, é "não deve ser mostrado". */
      percentual?: number;
      /** Presente entre 8 e 19: o percentual sai, mas acompanhado da ressalva. */
      aviso?: string;
    };

export const AVISO_BASE_CURTA =
  "Base amostral pequena: o percentual descreve a amostra analisada, não tendência do tribunal.";

/**
 * Monta um indicador a partir de uma contagem e do total analisado.
 *
 * `total` é a BASE ANALISADA daquele indicador, não o total do relatório. Um indicador por câmara
 * tem como base as decisões daquela câmara — usar o total geral inflaria a confiança de um recorte
 * que pode ter três decisões.
 */
export function montarIndicador(valor: number, total: number): Indicador {
  if (!Number.isFinite(valor) || !Number.isFinite(total) || total < 0) {
    return { exibir: false, motivo: "DADO_AUSENTE", total: 0 };
  }

  if (total < MIN_PARA_EXIBIR) {
    return { exibir: false, motivo: "AMOSTRA_INSUFICIENTE", total };
  }

  if (total < MIN_PARA_PERCENTUAL) {
    return { exibir: true, valor, total };
  }

  const percentual = Math.round((valor / total) * 100);

  return total < MIN_SEM_AVISO
    ? { exibir: true, valor, total, percentual, aviso: AVISO_BASE_CURTA }
    : { exibir: true, valor, total, percentual };
}

/**
 * O dado de origem não existe. Diferente de amostra pequena: aqui não há o que contar, e o
 * indicador não deve ser exibido nem estimado (I-10, I-11, I-13).
 */
export function dadoAusente(): IndicadorOculto {
  return { exibir: false, motivo: "DADO_AUSENTE", total: 0 };
}

/**
 * Texto do indicador, em uma linha.
 *
 * O denominador e a palavra "analisados" são obrigatórios e não configuráveis: é o que impede o
 * percentual de ser lido como chance de ganhar. Quem quiser só o número usa os campos do objeto.
 */
export function textoIndicador(indicador: Indicador, substantivo = "decisões analisadas"): string {
  if (!indicador.exibir) {
    return indicador.motivo === "AMOSTRA_INSUFICIENTE"
      ? `Base insuficiente para indicador (${indicador.total} de ${MIN_PARA_EXIBIR} mínimas).`
      : "Dado não disponível nesta execução.";
  }

  const base = `${indicador.valor} de ${indicador.total} ${substantivo}`;
  return indicador.percentual === undefined
    ? base
    : `${base} (${indicador.percentual}% da amostra)`;
}
