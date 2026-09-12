import { z } from "zod";

/**
 * Competência material das Câmaras do TJPR — dado de **referência**, não de execução.
 *
 * Diferença que determina tudo nesta tabela: não pertence a nenhuma `analysis_run`, não contém
 * dado do cliente e não é descartado por HU-06. É norma pública (emenda regimental do TJPR), da
 * mesma natureza de `jurisprudence_decisions`: fica fora da cascata de descarte de sessão.
 *
 * O contrato vive num schema Zod, e não só em `interface`, pelo motivo de §11.7 aplicado ao
 * storage (`supabase-repository.ts`): linha lida do banco é revalidada antes de virar objeto de
 * domínio, porque um seed antigo ou uma escrita manual não são confiáveis só por estarem no banco.
 */
export const CamaraAreaSchema = z.enum(["CIVEL", "CRIMINAL"]);
export type CamaraArea = z.infer<typeof CamaraAreaSchema>;

export const CamaraCompetenciaSchema = z.object({
  area: CamaraAreaSchema,
  /** Rótulo literal do documento oficial: "1ª, 2ª e 3ª Cíveis", "3ª, 4ª e 5ª Criminais". */
  grupo: z.string().min(1),
  /**
   * O mesmo grupo, expandido câmara a câmara ("9ª Câmara Cível"), no formato em que o `chamber`
   * já chega das decisões (§3.4). É o que permite responder "de que a 9ª Câmara Cível cuida?" sem
   * reinterpretar o rótulo em cada consulta.
   */
  camaras: z.array(z.string().min(1)).min(1),
  secao: z.string().min(1),
  /** Letra do item no documento oficial ("a", "b", ...). Há lacunas: ver `NOTA_FONTE`. */
  item: z.string().regex(/^[a-z]$/),
  /** Texto oficial — é o que vale juridicamente. */
  competencia: z.string().min(1),
  /** Resumo explicativo da planilha. Sem valor normativo: nunca substitui `competencia`. */
  descricao: z.string().min(1),
  ordem: z.number().int().positive(),
  fonte: z.string().min(1),
});

export type CamaraCompetencia = z.infer<typeof CamaraCompetenciaSchema>;
