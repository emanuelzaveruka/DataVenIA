/**
 * Constantes de `lib/config/limits.ts` que também são usadas em componente cliente (a tela de
 * envio, para o limite de palavras-chave selecionáveis). Vivem num arquivo à parte porque
 * `limits.ts` lê `process.env` no nível do módulo (`intFromEnv`) para os knobs de concorrência —
 * seguro no servidor, mas `process` não existe no bundle do navegador, e importar o módulo inteiro
 * de um componente `"use client"` quebraria a página. `limits.ts` reexporta daqui, então não há
 * duplicação do literal.
 */

/**
 * Decisão de 2026-09-13: a busca deixou de ser gerada pela LLM (múltiplas queries MAIN_THESIS/
 * CONTRARY) e passou a ser **uma única query**, montada a partir de keywords que o próprio usuário
 * escolhe na tela de envio (sugeridas a partir da peça, sem modelo, ou digitadas por ele) — nunca
 * mais que isto, porque a busca do TJPR é AND estrito (medido contra o portal: cada palavra a mais
 * reduz a contagem de resultados exponencialmente) e o usuário precisa ter controle direto sobre
 * quantos termos está empilhando na mesma busca.
 */
export const MAX_USER_KEYWORDS = 5;
