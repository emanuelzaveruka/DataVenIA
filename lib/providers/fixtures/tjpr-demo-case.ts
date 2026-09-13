import type { JurisprudenceSearchItem, RawDecision } from "../../schemas/search.schema";

/**
 * Fixture versionada de demonstração (HU-37, contexto-geral.md §8 item 3). Caso ilustrativo:
 * negativa de cobertura por plano de saúde — o mesmo tema citado como exemplo real em §4.2
 * ("plano de saúde" retornou 3.970 resultados no portal).
 *
 * Dados 100% fictícios (partes, números de processo, magistrados) — nenhum corresponde a um
 * processo ou pessoa real. `url`/`sourceUrl` apontam para o domínio público real do TJPR
 * confirmado em `docs/tjpr-portal-validacao.md`, mas são placeholders ilustrativos, não links
 * verificados para uma decisão específica — a validação manual do portal (HU-38) ainda está
 * pendente. Não tratar como referência jurídica real.
 */
interface FixtureDecision {
  searchItem: JurisprudenceSearchItem;
  fullText: string;
}

const TJPR_PUBLIC_PORTAL_URL = "https://portal.tjpr.jus.br/jurisprudencia/publico/";

const FIXTURE_DECISIONS: FixtureDecision[] = [
  {
    searchItem: {
      id: "fixture-001",
      processNumber: "0001234-56.2023.8.16.0001",
      title: "Apelação Cível — Plano de saúde. Negativa de cobertura de cirurgia.",
      court: "TJPR",
      chamber: "9ª Câmara Cível",
      judge: "Des. Ricardo Almeida Neto",
      judgmentDate: "2023-11-14",
      summary:
        "Responsabilidade objetiva da operadora de plano de saúde. Negativa indevida de cobertura de procedimento cirúrgico prescrito por médico assistente. Dano moral configurado. Recurso provido.",
      url: `${TJPR_PUBLIC_PORTAL_URL}#/decisao/fixture-001`,
      source: "TJPR",
    },
    fullText:
      "EMENTA: APELAÇÃO CÍVEL. PLANO DE SAÚDE. NEGATIVA DE COBERTURA DE PROCEDIMENTO CIRÚRGICO. " +
      "RESPONSABILIDADE OBJETIVA. DANO MORAL CONFIGURADO. A negativa de cobertura de procedimento " +
      "prescrito por médico assistente, sem justificativa técnica idônea, configura falha na " +
      "prestação do serviço e gera dever de indenizar por dano moral, dada a situação de " +
      "vulnerabilidade do paciente. Recurso conhecido e provido.",
  },
  {
    searchItem: {
      id: "fixture-002",
      processNumber: "0002345-67.2023.8.16.0002",
      title: "Apelação Cível — Plano de saúde. Reajuste por faixa etária.",
      court: "TJPR",
      chamber: "9ª Câmara Cível",
      judge: "Desa. Fernanda Costa Lima",
      judgmentDate: "2023-08-02",
      summary:
        "Reajuste de mensalidade por mudança de faixa etária. Ausência de previsão contratual clara sobre o percentual. Abusividade reconhecida. Dano moral afastado por se tratar de mero inadimplemento contratual.",
      url: `${TJPR_PUBLIC_PORTAL_URL}#/decisao/fixture-002`,
      source: "TJPR",
    },
    fullText:
      "EMENTA: APELAÇÃO CÍVEL. PLANO DE SAÚDE. REAJUSTE POR FAIXA ETÁRIA. AUSÊNCIA DE CLÁUSULA " +
      "CONTRATUAL CLARA. ABUSIVIDADE. DANO MORAL AFASTADO. O reajuste por faixa etária sem " +
      "previsão contratual expressa e proporcional é abusivo à luz do CDC. Contudo, o mero " +
      "descumprimento contratual, sem repercussão além do aborrecimento cotidiano, não configura " +
      "dano moral indenizável. Recurso parcialmente provido.",
  },
  {
    searchItem: {
      id: "fixture-003",
      processNumber: "0003456-78.2022.8.16.0001",
      title: "Apelação Cível — Plano de saúde. Home care. Negativa de cobertura.",
      court: "TJPR",
      chamber: "3ª Câmara Cível",
      judge: "Des. Marcos Vinícius Teixeira",
      judgmentDate: "2022-05-20",
      summary:
        "Negativa de cobertura de home care sob alegação de exclusão contratual. Contrato anterior à Lei 9.656/98. Cláusula considerada abusiva por colocar o consumidor em desvantagem exagerada. Dano moral reconhecido.",
      url: `${TJPR_PUBLIC_PORTAL_URL}#/decisao/fixture-003`,
      source: "TJPR",
    },
    fullText:
      "EMENTA: APELAÇÃO CÍVEL. PLANO DE SAÚDE. HOME CARE. EXCLUSÃO CONTRATUAL. ABUSIVIDADE. DANO " +
      "MORAL. A exclusão de cobertura de assistência domiciliar (home care), quando essencial à " +
      "continuidade do tratamento iniciado em internação hospitalar, é considerada abusiva por " +
      "colocar o consumidor em desvantagem exagerada (art. 51, IV, CDC). Recurso provido.",
  },
  {
    searchItem: {
      id: "fixture-004",
      processNumber: "0004567-89.2022.8.16.0003",
      title: "Apelação Cível — Plano de saúde. Carência contratual.",
      court: "TJPR",
      chamber: "3ª Câmara Cível",
      judge: "Desa. Juliana Prado Fagundes",
      judgmentDate: "2022-02-10",
      summary:
        "Negativa de cobertura por período de carência contratual regularmente pactuado, sem urgência ou emergência demonstrada. Cláusula válida. Improcedência mantida.",
      url: `${TJPR_PUBLIC_PORTAL_URL}#/decisao/fixture-004`,
      source: "TJPR",
    },
    fullText:
      "EMENTA: APELAÇÃO CÍVEL. PLANO DE SAÚDE. CARÊNCIA CONTRATUAL. AUSÊNCIA DE URGÊNCIA OU " +
      "EMERGÊNCIA. CLÁUSULA VÁLIDA. Fora das hipóteses de urgência/emergência (art. 12, V, 'c', " +
      "Lei 9.656/98), a exigência de cumprimento do prazo de carência regularmente contratado não " +
      "constitui prática abusiva. Sentença de improcedência mantida.",
  },
  {
    searchItem: {
      id: "fixture-005",
      processNumber: "0005678-90.2021.8.16.0001",
      title: "Apelação Cível — Plano de saúde. Medicamento de uso domiciliar.",
      court: "TJPR",
      chamber: "9ª Câmara Cível",
      judge: "Des. Ricardo Almeida Neto",
      judgmentDate: "2021-09-30",
      summary:
        "Negativa de fornecimento de medicamento antineoplásico oral de uso domiciliar. Exclusão contratual expressa reconhecida como válida pela ausência de internação. Recurso desprovido.",
      url: `${TJPR_PUBLIC_PORTAL_URL}#/decisao/fixture-005`,
      source: "TJPR",
    },
    fullText:
      "EMENTA: APELAÇÃO CÍVEL. PLANO DE SAÚDE. MEDICAMENTO ORAL DE USO DOMICILIAR. EXCLUSÃO " +
      "CONTRATUAL EXPRESSA. A exclusão de cobertura de medicamentos de uso domiciliar, exceto " +
      "antineoplásicos orais previstos em rol próprio, é válida nos termos da Lei 9.656/98 quando " +
      "não há internação associada. Recurso desprovido.",
  },
  {
    searchItem: {
      id: "fixture-006",
      processNumber: "0006789-01.2021.8.16.0004",
      title: "Apelação Cível — Plano de saúde. Rol da ANS. Rol taxativo.",
      court: "TJPR",
      chamber: "3ª Câmara Cível",
      judge: "Desa. Juliana Prado Fagundes",
      judgmentDate: "2021-06-18",
      summary:
        "Discussão sobre taxatividade do rol de procedimentos da ANS. Negativa de cobertura de terapia não listada. Recurso desprovido por ausência de comprovação de ineficácia das alternativas listadas no rol.",
      url: `${TJPR_PUBLIC_PORTAL_URL}#/decisao/fixture-006`,
      source: "TJPR",
    },
    fullText:
      "EMENTA: APELAÇÃO CÍVEL. PLANO DE SAÚDE. ROL DA ANS. TAXATIVIDADE. Não comprovada a " +
      "ineficácia ou esgotamento das alternativas terapêuticas previstas no rol da ANS para o " +
      "quadro clínico do paciente, mantém-se a negativa de cobertura da terapia não listada. " +
      "Recurso desprovido.",
  },
  {
    searchItem: {
      id: "fixture-007",
      processNumber: "0007890-12.2020.8.16.0001",
      title: "Apelação Cível — Plano de saúde. Urgência/emergência. Carência.",
      court: "TJPR",
      chamber: "9ª Câmara Cível",
      judge: "Desa. Fernanda Costa Lima",
      judgmentDate: "2020-12-03",
      summary:
        "Atendimento de urgência dentro do período de carência. Limitação contratual de atendimento ambulatorial nas primeiras 24 horas considerada abusiva diante do quadro grave apresentado. Recurso provido.",
      url: `${TJPR_PUBLIC_PORTAL_URL}#/decisao/fixture-007`,
      source: "TJPR",
    },
    fullText:
      "EMENTA: APELAÇÃO CÍVEL. PLANO DE SAÚDE. URGÊNCIA. CARÊNCIA. LIMITAÇÃO ABUSIVA. A limitação " +
      "de atendimento de urgência/emergência a apenas as primeiras 24 horas, em contrato ainda em " +
      "carência, é abusiva quando o quadro clínico exige internação imediata. Recurso provido.",
  },
  {
    searchItem: {
      id: "fixture-008",
      processNumber: "0008901-23.2020.8.16.0002",
      title: "Apelação Cível — Plano de saúde. Reembolso de despesas.",
      court: "TJPR",
      chamber: "3ª Câmara Cível",
      judge: "Des. Marcos Vinícius Teixeira",
      judgmentDate: "2020-04-22",
      summary:
        "Pedido de reembolso integral de despesas realizadas fora da rede credenciada sem comprovação de urgência ou inexistência de prestador na rede. Reembolso limitado ao teto contratual. Recurso parcialmente provido.",
      url: `${TJPR_PUBLIC_PORTAL_URL}#/decisao/fixture-008`,
      source: "TJPR",
    },
    fullText:
      "EMENTA: APELAÇÃO CÍVEL. PLANO DE SAÚDE. REEMBOLSO. REDE NÃO CREDENCIADA. Fora das hipóteses " +
      "de urgência/emergência ou inexistência de prestador credenciado na região, o reembolso de " +
      "despesas fora da rede fica limitado à tabela contratual, não sendo devida a integralidade " +
      "do valor gasto. Recurso parcialmente provido.",
  },
  {
    searchItem: {
      id: "fixture-009",
      processNumber: "0009012-34.2019.8.16.0001",
      title: "Apelação Cível — Plano de saúde. Cancelamento unilateral.",
      court: "TJPR",
      chamber: "9ª Câmara Cível",
      judge: "Des. Ricardo Almeida Neto",
      judgmentDate: "2019-10-08",
      summary:
        "Cancelamento unilateral de plano coletivo empresarial sem notificação prévia adequada. Nulidade da rescisão. Restabelecimento do plano determinado. Dano moral reconhecido pela interrupção de tratamento em curso.",
      url: `${TJPR_PUBLIC_PORTAL_URL}#/decisao/fixture-009`,
      source: "TJPR",
    },
    fullText:
      "EMENTA: APELAÇÃO CÍVEL. PLANO DE SAÚDE COLETIVO. CANCELAMENTO UNILATERAL. AUSÊNCIA DE " +
      "NOTIFICAÇÃO PRÉVIA. NULIDADE. A rescisão unilateral de plano coletivo sem notificação prévia " +
      "com prazo razoável, sobretudo havendo tratamento em curso, é nula e gera dever de " +
      "restabelecimento e indenização por dano moral. Recurso provido.",
  },
];

export const FIXTURE_SEARCH_ITEMS: readonly JurisprudenceSearchItem[] = FIXTURE_DECISIONS.map(
  (decision) => decision.searchItem,
);

export const FIXTURE_RAW_DECISIONS: readonly RawDecision[] = FIXTURE_DECISIONS.map((decision) => ({
  id: decision.searchItem.id,
  processNumber: decision.searchItem.processNumber,
  court: decision.searchItem.court,
  judgingBody: decision.searchItem.chamber,
  rapporteur: decision.searchItem.judge,
  judgmentDate: decision.searchItem.judgmentDate,
  summary: decision.searchItem.summary,
  fullText: decision.fullText,
  sourceUrl: decision.searchItem.url,
}));
