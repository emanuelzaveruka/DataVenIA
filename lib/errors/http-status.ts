import type { AppError } from "./app-error";

/**
 * Categoria de erro (§11.3) → status HTTP. Existe como função própria porque o mesmo mapeamento é
 * usado em dois lugares que não podem divergir: a resposta de erro *antes* do stream abrir, que
 * ainda tem status real, e o campo `httpStatus` do evento de erro que viaja *dentro* do stream,
 * quando o 200 já foi enviado e o status vira dado, não cabeçalho.
 */
export function statusForError(error: AppError): number {
  if (error.category === "VALIDATION" || error.category === "PARSING") return 422;
  if (error.category === "RATE_LIMIT") return 429;
  if (error.category === "AUTH") return 401;
  return 500;
}
