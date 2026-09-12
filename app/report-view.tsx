import type {
  FinalReport,
  IssueClassification,
  ReportClaim,
  ReportIssue,
  ReportPrecedentItem,
  ReportSource,
} from "../lib/schemas/report.schema";
import { ResearchDisclaimer } from "./research-disclaimer";

const CLASSIFICATION_LABELS: Record<IssueClassification, string> = {
  TENDENCIA_FAVORAVEL: "Tendência favorável",
  TENDENCIA_CONTRARIA: "Tendência contrária",
  JURISPRUDENCIA_DIVIDIDA: "Jurisprudência dividida",
  INDETERMINADA: "Indeterminada",
};

/**
 * A cor nunca é o único portador do significado (o rótulo textual vem junto), para que a
 * classificação continue legível em leitor de tela e em daltonismo.
 */
const CLASSIFICATION_STYLES: Record<IssueClassification, string> = {
  TENDENCIA_FAVORAVEL:
    "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
  TENDENCIA_CONTRARIA:
    "border-red-300 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-200",
  JURISPRUDENCIA_DIVIDIDA:
    "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200",
  INDETERMINADA:
    "border-neutral-300 bg-neutral-100 text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300",
};

const CONVERGENCE_LABELS: Record<string, string> = {
  ALTA: "alta convergência jurisprudencial",
  MODERADA: "convergência moderada",
  DIVIDIDA: "jurisprudência dividida",
  AMOSTRA_INSUFICIENTE: "baixa quantidade de precedentes relevantes",
};

export function ReportView({ report }: { report: FinalReport }) {
  return (
    <article className="flex flex-col gap-6">
      <ResearchDisclaimer />

      <section aria-labelledby="resumo-do-caso">
        <h2 id="resumo-do-caso" className="text-lg font-semibold">
          Resumo do caso
        </h2>
        <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <Field label="Processo" value={report.caseSummary.processNumber} />
          <Field label="Órgão julgador" value={report.caseSummary.chamber} />
          <Field label="Parte autora" value={report.caseSummary.parties.plaintiff} />
          <Field label="Parte ré" value={report.caseSummary.parties.defendant} />
        </dl>
        <BulletList title="Pedidos" items={report.caseSummary.requests} />
        <BulletList title="Fatos" items={report.caseSummary.facts} />
      </section>

      <section aria-labelledby="questoes-juridicas" className="flex flex-col gap-6">
        <h2 id="questoes-juridicas" className="text-lg font-semibold">
          Questões jurídicas analisadas
        </h2>
        {report.issues.map((issue) => (
          <IssueSection key={issue.legalIssueId} issue={issue} />
        ))}
      </section>

      <ReportFooter report={report} />
    </article>
  );
}

function IssueSection({ issue }: { issue: ReportIssue }) {
  return (
    <section
      aria-labelledby={`questao-${issue.legalIssueId}`}
      className="rounded-lg border border-neutral-300 p-4 dark:border-neutral-700"
    >
      <header className="flex flex-col gap-2">
        <h3 id={`questao-${issue.legalIssueId}`} className="text-base font-semibold">
          {issue.topic}
        </h3>
        <p className="text-sm text-neutral-500">{issue.question}</p>
        <p
          className={`w-fit rounded-full border px-3 py-1 text-xs font-medium ${CLASSIFICATION_STYLES[issue.classification]}`}
        >
          {CLASSIFICATION_LABELS[issue.classification]}
        </p>
        <p className="text-xs text-neutral-500">{issue.classificationReason}</p>
      </header>

      <div className="mt-4 rounded-md bg-neutral-100 p-3 text-sm dark:bg-neutral-900">
        <p className="font-medium">Tendência jurisprudencial</p>
        <p className="mt-1">{issue.trend.summary}</p>
        <p className="mt-1 text-neutral-500">
          Leitura: {CONVERGENCE_LABELS[issue.trend.convergence] ?? issue.trend.convergence}.
        </p>
      </div>

      {issue.conclusion && <p className="mt-4 text-sm">{issue.conclusion}</p>}
      {issue.conclusionBlockedReason && (
        <p className="mt-4 rounded-md border border-amber-300 p-3 text-sm text-amber-900 dark:border-amber-700 dark:text-amber-200">
          {issue.conclusionBlockedReason}
        </p>
      )}

      {issue.chamberPattern && (
        <p className="mt-3 text-sm text-neutral-500">Padrão do órgão julgador: {issue.chamberPattern}</p>
      )}

      <BulletList title="Fatores recorrentes" items={issue.recurringFactors} />

      <PrecedentSection title="Pontos favoráveis" items={issue.favorablePoints} />
      <PrecedentSection
        title="Pontos contrários"
        items={issue.contraryPoints}
        notice={issue.contraryPointsNotice}
      />

      <ClaimSection title="Principais riscos" claims={issue.risks} />

      {issue.distinguishing.length > 0 && (
        <section className="mt-4">
          <h4 className="text-sm font-semibold">Distinguishing</h4>
          <ul className="mt-2 flex flex-col gap-2">
            {issue.distinguishing.map((item, index) => (
              <li key={`${item.scratchpadId}-${index}`} className="text-sm">
                {item.fact} <SourceLine source={item.source} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <ClaimSection title="Estratégia argumentativa sugerida" claims={issue.suggestedArguments} />
    </section>
  );
}

function PrecedentSection({
  title,
  items,
  notice,
}: {
  title: string;
  items: ReportPrecedentItem[];
  notice?: string;
}) {
  return (
    <section className="mt-4">
      <h4 className="text-sm font-semibold">{title}</h4>
      {items.length === 0 ? (
        // HU-22: a seção nunca some — a ausência é declarada.
        <p className="mt-2 text-sm text-neutral-500">{notice}</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-3">
          {items.map((item) => (
            <li
              key={item.evidenceId}
              className="rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800"
            >
              <p className="font-medium">{item.argument}</p>
              <blockquote className="mt-2 border-l-2 border-neutral-300 pl-3 text-neutral-600 dark:border-neutral-600 dark:text-neutral-400">
                “{item.quote}”
              </blockquote>
              <p className="mt-1 text-xs text-neutral-500">{item.context}</p>
              <SourceLine source={item.source} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ClaimSection({ title, claims }: { title: string; claims: ReportClaim[] }) {
  if (claims.length === 0) return null;

  return (
    <section className="mt-4">
      <h4 className="text-sm font-semibold">{title}</h4>
      <ul className="mt-2 flex flex-col gap-2">
        {claims.map((claim, index) => (
          <li key={`${title}-${index}`} className="text-sm">
            <p>{claim.statement}</p>
            <ul className="mt-1 flex flex-col gap-0.5">
              {claim.sources.map((source, sourceIndex) => (
                <li key={`${claim.evidenceIds[sourceIndex] ?? sourceIndex}`}>
                  <SourceLine source={source} />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * HU-27 — a linha de origem é o caminho do achado até a fonte oficial: processo, Câmara, relator e
 * data ficam visíveis (não escondidos atrás do link), e o link abre a decisão no portal do TJPR.
 */
function SourceLine({ source }: { source: ReportSource }) {
  return (
    <span className="mt-1 block text-xs text-neutral-500">
      {source.processNumber} · {source.chamber} · {source.judge} · {source.judgmentDate} ·{" "}
      <a
        href={source.url}
        target="_blank"
        rel="noreferrer noopener"
        className="underline underline-offset-2 hover:text-neutral-900 dark:hover:text-neutral-100"
      >
        Abrir decisão no portal do TJPR
      </a>
    </span>
  );
}

function ReportFooter({ report }: { report: FinalReport }) {
  return (
    <footer className="flex flex-col gap-3 border-t border-neutral-200 pt-4 text-xs text-neutral-500 dark:border-neutral-800">
      <p>
        {report.sample.analyzedDecisions} decisão(ões) analisada(s) em profundidade ·{" "}
        {report.sample.verifiedEvidence} citação(ões) conferida(s) na fonte original ·{" "}
        {report.sample.omittedItems} item(ns) omitido(s) por falta de verificação.
      </p>

      {report.omissions.length > 0 && (
        // §14: o relatório precisa conseguir responder por que algo não aparece, não só o que aparece.
        <details>
          <summary className="cursor-pointer">Ver o que foi omitido e por quê</summary>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
            {report.omissions.map((omission, index) => (
              <li key={`${omission.kind}-${index}`}>
                <span className="font-medium">{omission.subject}</span> — {omission.reason}
              </li>
            ))}
          </ul>
        </details>
      )}

      <ResearchDisclaimer />
    </footer>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <dt className="text-neutral-500">{label}:</dt>
      <dd>{value}</dd>
    </div>
  );
}

function BulletList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <section className="mt-3">
      <h4 className="text-sm font-semibold">{title}</h4>
      <ul className="mt-1 list-disc pl-5 text-sm">
        {items.map((item, index) => (
          <li key={`${title}-${index}`}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
