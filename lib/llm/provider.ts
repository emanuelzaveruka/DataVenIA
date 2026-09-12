import type { z } from "zod";
import type { ToolResult } from "../errors/tool-result";

export interface GenerateStructuredParams<T> {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  schemaName: string;
  schemaDescription?: string;
  maxOutputTokens?: number;
}

/**
 * Nenhum serviço (case-analysis, scratchpad, cross-file, evidence) importa um SDK de modelo
 * diretamente — todos dependem apenas desta interface (contexto-geral.md §15).
 */
export interface LlmProvider {
  readonly name: string;
  /**
   * Modelo concreto por trás do provider. É obrigatório (e não derivável de `name`) porque entra
   * na chave de idempotência de HU-33/§11.6: dois modelos do mesmo provider produzem resultados
   * diferentes, e um cache que os confundisse reusaria silenciosamente saída de outro modelo.
   */
  readonly model: string;
  generateStructured<T>(params: GenerateStructuredParams<T>): Promise<ToolResult<T>>;
}
