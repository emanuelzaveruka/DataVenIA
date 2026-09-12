import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CamaraCompetenciaSchema } from "../../schemas/competencia.schema";
import {
  findCompetenciasByCamara,
  findCompetenciasBySecao,
  listCamaraCompetencias,
  listCamaras,
  searchCompetencias,
  suggestCamaras,
} from "../camara-competencias";

describe("competência das câmaras (dataset gerado da planilha do TJPR)", () => {
  it("valida toda linha do dataset contra o schema", () => {
    for (const entry of listCamaraCompetencias()) {
      expect(() => CamaraCompetenciaSchema.parse(entry)).not.toThrow();
    }
  });

  it("cobre as 20 câmaras cíveis e as 5 criminais", () => {
    const camaras = listCamaras();
    expect(camaras.filter((name) => name.endsWith("Cível"))).toHaveLength(20);
    expect(camaras.filter((name) => name.endsWith("Criminal"))).toHaveLength(5);
  });

  it("não repete posição dentro do mesmo grupo (é a chave única da tabela)", () => {
    const keys = listCamaraCompetencias().map((entry) => `${entry.grupo}#${entry.ordem}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("preserva a lacuna da letra 'f' nas 4ª/5ª Cíveis sem repetir o 'e' duplicado da fonte", () => {
    const itens = findCompetenciasByCamara("4ª Câmara Cível").map((entry) => entry.item);
    expect(itens.filter((item) => item === "e")).toHaveLength(1);
    expect(itens).not.toContain("f");
  });

  it("encontra a câmara pelo nome como ele chega das decisões, com ou sem acento", () => {
    const comAcento = findCompetenciasByCamara("9ª Câmara Cível");
    const semAcento = findCompetenciasByCamara("9a camara civel");
    expect(comAcento).toEqual(semAcento);
    expect(comAcento.map((entry) => entry.competencia)).toContain(
      "ações e execuções de contrato de seguro e de plano de saúde",
    );
  });

  it("roteia a matéria do caso da fixture (plano de saúde) para as câmaras da 4ª Seção Cível", () => {
    const camaras = suggestCamaras("negativa de cobertura de plano de saúde");
    // As melhores primeiro; termos genéricos ("saúde") ainda trazem outras seções depois, de
    // propósito — a ordenação é a resposta, não um corte silencioso.
    expect(camaras.slice(0, 3)).toEqual(["8ª Câmara Cível", "9ª Câmara Cível", "10ª Câmara Cível"]);
    expect(findCompetenciasBySecao("4ª Seção Cível").map((entry) => entry.grupo)).toContain(
      "8ª, 9ª e 10ª Cíveis",
    );
  });

  it("explica o match pelos termos encontrados, sem score opaco", () => {
    const primeiro = searchCompetencias("improbidade administrativa")[0];
    expect(primeiro?.entry.camaras).toContain("4ª Câmara Cível");
    expect(primeiro?.matchedTerms).toEqual(["improbidade", "administrativa"]);
  });

  it("ignora termos curtos demais para discriminar qualquer coisa", () => {
    expect(searchCompetencias("de e ao")).toEqual([]);
  });

  // O seed SQL e o dataset TS são as duas cópias do mesmo dado (Postgres e memória). Saem do mesmo
  // script numa rodada só; este teste é o que pega uma edição à mão em qualquer um dos dois.
  it("mantém o seed SQL em sincronia com o dataset", () => {
    const seed = readFileSync("supabase/seed/camara_competencias.sql", "utf8");
    const linhas = [...seed.matchAll(/^ {2}\('(CIVEL|CRIMINAL)',/gm)];
    expect(linhas).toHaveLength(listCamaraCompetencias().length);

    for (const entry of listCamaraCompetencias()) {
      expect(seed).toContain(`'${entry.competencia.replace(/'/g, "''")}'`);
    }
  });
});
