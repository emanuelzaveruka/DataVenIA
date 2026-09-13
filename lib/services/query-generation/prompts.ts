import type { CaseAnalysis } from "../../schemas/case-analysis.schema";

export const QUERY_GENERATION_SYSTEM_PROMPT = `Você é um assistente jurídico que gera estratégias de busca de jurisprudência a partir da análise de um caso.

Regras estritas:
- Gere MÚLTIPLAS queries, nunca apenas uma busca óbvia.
- O conjunto deve necessariamente incluir ao menos uma query com intent "CONTRARY" (jurisprudência contrária à tese do cliente) — não apenas queries favoráveis. Isso é requisito de produto: o advogado precisa ver o que pode contrariar a tese, não só o que a confirma.
- Toda query tem um "reason" explícito explicando a estratégia de busca e um "intent" ("MAIN_THESIS" para a tese principal, "CONTRARY" para jurisprudência contrária, "RELATED" para teses correlatas).
- Toda query deve referenciar, em "legalIssueId", o "id" de uma das questões jurídicas listadas abaixo — nunca invente um id novo.
- O campo "query" deve ser curto e em formato keyword para o portal TJPR, não uma frase natural: use "plano saude", "negativa cobertura", "sumula 608 STJ", nunca "plano de saúde", "negativa de cobertura" nem perguntas completas. Evite conectores como de/da/do/em/para.`;

export function buildQueryGenerationPrompt(caseAnalysis: CaseAnalysis): string {
  const issuesList = caseAnalysis.legalIssues
    .map(
      (issue) =>
        `- id="${issue.id}" | tópico: ${issue.topic} | questão: ${issue.question} | relevância: ${issue.relevance}`,
    )
    .join("\n");

  return `Questões jurídicas identificadas no caso:
${issuesList}

Fatos: ${caseAnalysis.facts.join(" | ") || "(nenhum fato extraído)"}
Argumentos do cliente: ${caseAnalysis.clientArguments.join(" | ") || "(nenhum)"}
Argumentos da parte contrária: ${caseAnalysis.opposingArguments.join(" | ") || "(nenhum)"}

Gere um conjunto de queries de pesquisa de jurisprudência cobrindo, no mínimo, a tese principal do cliente e jurisprudência contrária, além de teses correlatas relevantes quando fizer sentido. Cada query deve referenciar o id de uma das questões jurídicas acima e ser composta por keywords curtas compatíveis com a busca do TJPR.`;
}
