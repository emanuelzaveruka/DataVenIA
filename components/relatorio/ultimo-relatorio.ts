"use client";

import type { FinalReport } from "@/lib/schemas/report.schema";

/**
 * Ponte entre a tela de envio e a de relatório: guarda o último relatório gerado nesta aba.
 *
 * **`sessionStorage`, não `localStorage`, e não banco.** HU-06 manda descartar os dados da sessão ao
 * encerrar a navegação, e o relatório carrega o resumo do caso do cliente — `sessionStorage` morre
 * junto com a aba, que é exatamente o comportamento que a HU pede, sem código de expiração para
 * manter. Persistir no servidor exigiria `listRuns` no repositório e um Supabase provisionado
 * (backlog), e nada disso é necessário para ler um relatório que acabou de ser gerado.
 *
 * Toda leitura e escrita é tolerante a falha: aba anônima, cota estourada e storage bloqueado por
 * política do navegador lançam exceção, e nenhum deles é motivo para derrubar a análise que o
 * usuário acabou de esperar dois minutos para ver.
 */
const CHAVE = "datavenia:ultimo-relatorio";

export interface RelatorioGuardado {
  report: FinalReport;
  fileName: string;
  runId: string;
  geradoEm: string;
}

export function guardarRelatorio(dados: RelatorioGuardado): void {
  try {
    sessionStorage.setItem(CHAVE, JSON.stringify(dados));
    brutoEmCache = null;
  } catch {
    // Sem storage o usuário ainda vê o relatório inline no envio; só o atalho para /relatorio
    // deixa de funcionar. Não é motivo para erro na tela.
  }
}

/**
 * Cache do último valor lido, indexado pela string crua.
 *
 * Existe por exigência de `useSyncExternalStore`: o snapshot precisa devolver a MESMA referência
 * enquanto a origem não mudar. `JSON.parse` devolve um objeto novo a cada chamada, e sem este cache
 * o React entraria em re-render infinito achando que o storage muda a cada quadro.
 */
let brutoEmCache: string | null = null;
let valorEmCache: RelatorioGuardado | null = null;

export function snapshotRelatorio(): RelatorioGuardado | null {
  let bruto: string | null;
  try {
    bruto = sessionStorage.getItem(CHAVE);
  } catch {
    return null;
  }

  if (bruto === brutoEmCache) return valorEmCache;
  brutoEmCache = bruto;

  try {
    const dados = bruto ? (JSON.parse(bruto) as RelatorioGuardado) : null;
    // Checagem mínima de forma: o conteúdo pode ter vindo de uma versão anterior do app. Não
    // revalida o schema inteiro porque o dado foi escrito por esta mesma aba, nesta sessão.
    valorEmCache = dados?.report?.issues ? dados : null;
  } catch {
    valorEmCache = null;
  }

  return valorEmCache;
}

/** No servidor não há storage — e o painel precisa de um estado inicial estável para hidratar. */
export function snapshotNoServidor(): RelatorioGuardado | null {
  return null;
}

export function assinarRelatorio(aoMudar: () => void): () => void {
  // `storage` dispara em OUTRAS abas. Basta para manter duas abas coerentes; a própria aba já
  // re-renderiza pelo fluxo normal depois de gravar.
  window.addEventListener("storage", aoMudar);
  return () => window.removeEventListener("storage", aoMudar);
}

export function limparRelatorio(): void {
  try {
    sessionStorage.removeItem(CHAVE);
    brutoEmCache = null;
  } catch {
    // idem
  }
}
