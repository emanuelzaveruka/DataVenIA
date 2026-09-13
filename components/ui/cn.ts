/**
 * Concatena classes ignorando falsy. Não é `clsx`: o projeto não tem dependência de runtime para
 * isto e não vale adicionar uma — a única necessidade real aqui é `cond && "classe"`.
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
