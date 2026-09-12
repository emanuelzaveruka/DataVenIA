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
  generateStructured<T>(params: GenerateStructuredParams<T>): Promise<ToolResult<T>>;
}
