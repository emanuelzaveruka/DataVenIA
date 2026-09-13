import { describe, expect, it } from "vitest";
import {
  AVISO_BASE_CURTA,
  dadoAusente,
  montarIndicador,
  textoIndicador,
  MIN_PARA_EXIBIR,
  MIN_PARA_PERCENTUAL,
  MIN_SEM_AVISO,
} from "../indicadores";

/**
 * A escala inteira, faixa por faixa e nas bordas. As fronteiras são o que mais quebra em regra de
 * exibição: 7 e 8 caem em lados opostos, 19 e 20 também.
 */
describe("montarIndicador — escala por base amostral", () => {
  it.each([0, 1, 2])("não exibe com base %i (menos de 3)", (total) => {
    const indicador = montarIndicador(1, total);
    expect(indicador.exibir).toBe(false);
    expect(indicador.exibir === false && indicador.motivo).toBe("AMOSTRA_INSUFICIENTE");
  });

  it.each([3, 4, 5, 6, 7])("exibe só contagem absoluta com base %i (3 a 7)", (total) => {
    const indicador = montarIndicador(2, total);
    expect(indicador.exibir).toBe(true);
    // `percentual` ausente não é zero: é "não deve ser mostrado".
    expect(indicador.exibir === true && indicador.percentual).toBeUndefined();
    expect(indicador.exibir === true && indicador.aviso).toBeUndefined();
  });

  it.each([8, 12, 19])("exibe percentual COM aviso na base %i (8 a 19)", (total) => {
    const indicador = montarIndicador(4, total);
    expect(indicador.exibir === true && indicador.percentual).toBeTypeOf("number");
    expect(indicador.exibir === true && indicador.aviso).toBe(AVISO_BASE_CURTA);
  });

  it.each([20, 23, 100])("exibe percentual sem aviso na base %i (20 ou mais)", (total) => {
    const indicador = montarIndicador(10, total);
    expect(indicador.exibir === true && indicador.percentual).toBeTypeOf("number");
    expect(indicador.exibir === true && indicador.aviso).toBeUndefined();
  });

  it("as fronteiras caem do lado certo", () => {
    expect(montarIndicador(1, MIN_PARA_EXIBIR - 1).exibir).toBe(false);
    expect(montarIndicador(1, MIN_PARA_EXIBIR).exibir).toBe(true);

    const seteDecisoes = montarIndicador(4, MIN_PARA_PERCENTUAL - 1);
    const oitoDecisoes = montarIndicador(4, MIN_PARA_PERCENTUAL);
    expect(seteDecisoes.exibir === true && seteDecisoes.percentual).toBeUndefined();
    expect(oitoDecisoes.exibir === true && oitoDecisoes.percentual).toBeTypeOf("number");

    const dezenove = montarIndicador(9, MIN_SEM_AVISO - 1);
    const vinte = montarIndicador(9, MIN_SEM_AVISO);
    expect(dezenove.exibir === true && dezenove.aviso).toBe(AVISO_BASE_CURTA);
    expect(vinte.exibir === true && vinte.aviso).toBeUndefined();
  });

  it("arredonda o percentual para inteiro", () => {
    const indicador = montarIndicador(15, 23);
    expect(indicador.exibir === true && indicador.percentual).toBe(65);
  });

  it("aceita os extremos sem inventar número", () => {
    const nenhum = montarIndicador(0, 20);
    const todos = montarIndicador(20, 20);
    expect(nenhum.exibir === true && nenhum.percentual).toBe(0);
    expect(todos.exibir === true && todos.percentual).toBe(100);
  });

  it.each([
    ["NaN no valor", Number.NaN, 20],
    ["NaN no total", 5, Number.NaN],
    ["total negativo", 5, -1],
  ])("trata %s como dado ausente, não como zero", (_caso, valor, total) => {
    const indicador = montarIndicador(valor, total);
    expect(indicador.exibir).toBe(false);
    expect(indicador.exibir === false && indicador.motivo).toBe("DADO_AUSENTE");
  });
});

describe("dadoAusente", () => {
  it("é um estado distinto de amostra insuficiente", () => {
    // Zero e "não sei" são leituras opostas: a primeira diz que a busca olhou e não achou.
    expect(dadoAusente().exibir).toBe(false);
    expect(dadoAusente().motivo).toBe("DADO_AUSENTE");
    const baseCurta = montarIndicador(0, 1);
    expect(baseCurta.exibir === false && baseCurta.motivo).toBe("AMOSTRA_INSUFICIENTE");
  });
});

describe("textoIndicador", () => {
  it("nunca escreve percentual sem o denominador ao lado", () => {
    // É o que separa "fato sobre a amostra" de "chance de ganhar" (§3.10/HU-29).
    const texto = textoIndicador(montarIndicador(15, 23));
    expect(texto).toBe("15 de 23 decisões analisadas (65% da amostra)");
    expect(texto).toContain("de 23");
  });

  it("omite o percentual quando a base não autoriza", () => {
    const texto = textoIndicador(montarIndicador(2, 5));
    expect(texto).toBe("2 de 5 decisões analisadas");
    expect(texto).not.toContain("%");
  });

  it("diz por que não há número, em vez de mostrar zero", () => {
    expect(textoIndicador(montarIndicador(1, 2))).toContain("Base insuficiente");
    expect(textoIndicador(dadoAusente())).toContain("não disponível");
  });

  it("aceita outro substantivo para a base", () => {
    expect(textoIndicador(montarIndicador(4, 9), "acórdãos da câmara")).toContain(
      "acórdãos da câmara",
    );
  });
});
