/**
 * Host oficial único da fonte de jurisprudência (HU-36: um só tribunal; §7.1: "restringir hosts
 * permitidos, nunca executar URLs arbitrárias"). Centralizado aqui porque duas regras distintas
 * dependem dele: a fixture monta suas URLs de demonstração sobre este domínio (HU-37) e o
 * relatório final recusa exibir um achado cuja URL não aponte para a fonte oficial (HU-27).
 */
export const TJPR_OFFICIAL_HOST = "portal.tjpr.jus.br";

/**
 * HU-27 — "link quebrado ou ausente para uma decisão citada bloqueia a exibição daquele item".
 * Sem rede: o que dá para afirmar deterministicamente é que a URL existe, é bem formada, usa
 * HTTPS e aponta para o domínio oficial do TJPR. Um link que não passa nisso não é rastreável
 * até a fonte e, por isso, não pode sustentar um achado exibido ao advogado.
 */
export function isOfficialTjprUrl(url: string | undefined): boolean {
  if (!url) return false;

  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === TJPR_OFFICIAL_HOST;
  } catch {
    return false;
  }
}
