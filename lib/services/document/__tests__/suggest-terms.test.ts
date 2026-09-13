import { describe, expect, it } from "vitest";
import { suggestSearchTerms } from "../suggest-terms";

/** Peça de plano de saúde já sanitizada — é assim que o texto chega à sugestão (HU-05 antes). */
const PETICAO = `
EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DE DIREITO DA VARA CÍVEL

[PARTE_1], já qualificada, vem propor AÇÃO DE OBRIGAÇÃO DE FAZER em face de
[PARTE_2] Saúde S.A.

A autora firmou contrato de plano de saúde e teve negada a cobertura de procedimento
cirúrgico prescrito pelo médico assistente. A negativa de cobertura se deu sob alegação
de exclusão contratual genérica.

A negativa de cobertura é abusiva nos termos do art. 51 do CDC, e o plano de saúde não
pode limitar o tratamento prescrito. A Lei 9.656/1998 e a Súmula 608 do STJ amparam a
pretensão. O Código de Defesa do Consumidor determina a inversão do ônus da prova.

Requer a cobertura integral do procedimento cirúrgico e indenização por dano moral,
pois a negativa de cobertura causou dano moral indenizável à autora.
`;

describe("suggestSearchTerms", () => {
  it("sugere as citações legais da peça", () => {
    const termos = suggestSearchTerms(PETICAO);

    expect(termos).toContain("art 51 CDC");
    expect(termos).toContain("lei 9.656/1998");
    expect(termos).toContain("sumula 608 STJ");
  });

  it("sugere a matéria recorrente em keywords compatíveis com o TJPR", () => {
    const termos = suggestSearchTerms(PETICAO, 20).map((termo) => termo.toLowerCase());

    expect(termos).toContain("negativa cobertura");
    expect(termos).toContain("plano saude");
  });

  it("nunca devolve marcador de sanitização como termo de busca", () => {
    const termos = suggestSearchTerms(PETICAO, 50);
    // Reintroduzir [PARTE_1] na consulta desfaria na busca o que HU-05 acabou de mascarar.
    expect(termos.every((termo) => !termo.includes("["))).toBe(true);
  });

  it("descarta o que aparece uma vez só e respeita o teto", () => {
    const termos = suggestSearchTerms(PETICAO, 3);
    expect(termos).toHaveLength(3);
  });

  it("devolve lista vazia para texto vazio, sem estourar", () => {
    expect(suggestSearchTerms("")).toEqual([]);
    expect(suggestSearchTerms("   \n  ")).toEqual([]);
  });
});
