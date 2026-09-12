import type { ParsedDocument } from "../schemas/document.schema";
import type { RedactionSummary } from "../schemas/sanitization.schema";

export interface StoredDocument {
  parsed: ParsedDocument;
  sanitizedText: string;
  redactions: RedactionSummary[];
}

/**
 * Placeholder em memória até a persistência real (Postgres/Supabase) entrar na Fase 8 — HU-34.
 * Vale só durante o processo do servidor; não sobrevive a um redeploy/restart.
 */
const documents = new Map<string, StoredDocument>();

export function saveDocument(documentId: string, value: StoredDocument): void {
  documents.set(documentId, value);
}

export function getDocument(documentId: string): StoredDocument | undefined {
  return documents.get(documentId);
}
