import type {
  FinalReport,
  IssueClassification,
  ReportClaim,
  ReportIssue,
  ReportPrecedentItem,
  ReportSource,
} from "../lib/schemas/report.schema";
import { ResearchDisclaimer } from "./research-disclaimer";
import { HelpHint } from "./components/help-hint";
import { GLOSSARY } from "../lib/config/glossary";

const CLASSIFICATION_LABELS: Record<IssueClassification, string> = {
  TENDENCIA_FAVORAVEL: "Tendência favorável",
  TENDENCIA_CONTRARIA: "Tendência contrária",
  JURISPRUDENCIA_DIVIDIDA: "Jurisprudência dividida",
  INDETERMINADA: "Indeterminada",
};

/**
 * A cor nunca é o único portador do significado (o rótulo textual vem junto), para que a
 * classificação continue legível em leitor de tela e em daltonismo.
 *
 * A paleta é CATEGÓRICA, não uma escala de aprovação (docs/identidade-visual.md §4): verde para
 * favorável e vermelho para contrário diriam "você ganha / você perde" por baixo do texto, que é
 * exatamente o juízo de êxito proibido por §3.10/HU-29 — e, sendo o verde a cor da marca, faria a
 * identidade torcer por um lado. Azul, roxo e teal não carregam essa valência, e ficam fora do
 * vermelho/âmbar reservado a estado de sistema: precedente contrário não é defeito da aplicação.
 *
 * As três têm luminância pareada de propósito (~1,05:1 entre si), para que nenhuma pese mais que
 * as outras. O efeito colateral é que em escala de cinza elas são indistinguíveis — por isso
 * CLASSIFICATION_SHAPES não é decoração: é o que sustenta a regra quando a cor não chega.
 */
const CLASSIFICATION_STYLES: Record<IssueClassification, string> = {
  TENDENCIA_FAVORAVEL:
    "border-stance-supports bg-ink-100 text-stance-supports dark:border-stance-supports-dark dark:bg-ink-800 dark:text-stance-supports-dark",
  TENDENCIA_CONTRARIA:
    "border-stance-opposes bg-ink-100 text-stance-opposes dark:border-stance-opposes-dark dark:bg-ink-800 dark:text-stance-opposes-dark",
  JURISPRUDENCIA_DIVIDIDA:
    "border-stance-mixed bg-ink-100 text-stance-mixed dark:border-stance-mixed-dark dark:bg-ink-800 dark:text-stance-mixed-dark",
  INDETERMINADA:
    "border-ink-500 bg-ink-100 text-ink-600 dark:border-ink-500 dark:bg-ink-800 dark:text-ink-400",
};

/** Segundo portador do significado, junto do rótulo textual. `aria-hidden`: o rótulo já diz. */
const CLASSIFICATION_SHAPES: Record<IssueClassification, string> = {
  TENDENCIA_FAVORAVEL: "\u25CF",
  TENDENCIA_CONTRARIA: "\u25A0",
  JURISPRUDENCIA_DIVIDIDA: "\u25C6",
  INDETERMINADA: "\u25CB",
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
      className="rounded-lg border border-ink-300 p-4 dark:border-ink-700"
    >
      <header className="flex flex-col gap-2">
        <h3 id={`questao-${issue.legalIssueId}`} className="text-base font-semibold">
          {issue.topic}
        </h3>
        <p className="text-sm text-ink-600 dark:text-ink-400">{issue.question}</p>
        <p className="flex flex-wrap items-center gap-1.5">
          <span
            className={`flex w-fit items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${CLASSIFICATION_STYLES[issue.classification]}`}
          >
            <span aria-hidden="true">{CLASSIFICATION_SHAPES[issue.classification]}</span>
            {CLASSIFICATION_LABELS[issue.classification]}
          </span>
          {issue.classification === "INDETERMINADA" && <HelpHint entry={GLOSSARY.indeterminada} />}
        </p>
        <p className="text-xs text-ink-600 dark:text-ink-400">{issue.classificationReason}</p>
      </header>

      <div className="mt-4 rounded-md border border-ink-300 bg-ink-100 p-3 text-sm dark:border-ink-700 dark:bg-ink-800">
        <p className="font-medium">Tendência jurisprudencial</p>
        <p className="mt-1">{issue.trend.summary}</p>
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-ink-600 dark:text-ink-400">
          <span>Leitura: {CONVERGENCE_LABELS[issue.trend.convergence] ?? issue.trend.convergence}.</span>
          <HelpHint entry={GLOSSARY.convergencia} />
        </p>
      </div>

      {issue.conclusion && <p className="mt-4 text-sm">{issue.conclusion}</p>}
      {issue.conclusionBlockedReason && (
        <p className="mt-4 rounded-md border border-warn p-3 text-sm text-warn dark:border-warn-dark dark:text-warn-dark">
          {issue.conclusionBlockedReason}
        </p>
      )}

      {issue.chamberPattern && (
        <p className="mt-3 text-sm text-ink-600 dark:text-ink-400">Padrão do órgão julgador: {issue.chamberPattern}</p>
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
          <h4 className="flex items-center gap-1.5 text-sm font-semibold">
            Distinguishing
            <HelpHint entry={GLOSSARY.distinguishing} />
          </h4>
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
        <p className="mt-2 text-sm text-ink-600 dark:text-ink-400">{notice}</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-3">
          {items.map((item) => (
            <li
              key={item.evidenceId}
              // Um precedente separado da citação que o sustenta perde o sentido. `bloco-indivisivel`
              // só age na impressão e é pontual de propósito: a regra antiga valia para TODA section
              // e li, e um bloco maior que a página era empurrado inteiro, deixando folha em branco.
              className="bloco-indivisivel rounded-md border border-ink-300 p-3 text-sm dark:border-ink-700"
            >
              <p className="font-medium">{item.argument}</p>
              <blockquote className="mt-2 border-l-2 border-ink-500 pl-3 text-ink-600 dark:border-ink-500 dark:text-ink-400">
                “{item.quote}”
              </blockquote>
              <p className="mt-1 text-xs text-ink-600 dark:text-ink-400">{item.context}</p>
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
 *
 * Se o achado chegou até aqui, ele tem metadado de origem completo e URL oficial de decisão — é a
 * única condição em que este componente é chamado (`toReportSource`). O host aparece ao lado do
 * link porque o rótulo fixo escondia a URL: um link quebrado só era descoberto ao clicar.
 */
function SourceLine({ source }: { source: ReportSource }) {
  return (
    // `fonte-impressa`: no PDF a URL é escrita por extenso ao lado do link (regra em globals.css).
    // No papel não se clica, e sem a URL a proveniência de HU-27 morre exatamente na exportação —
    // que é quando o leitor está mais longe de conseguir conferir a citação.
    <span className="fonte-impressa mt-1 block text-xs text-ink-600 dark:text-ink-400">
      {source.processNumber} · {source.chamber} · {source.judge} · {source.judgmentDate} ·{" "}
      <a
        href={source.url}
        target="_blank"
        rel="noreferrer noopener"
        className="underline underline-offset-2 hover:text-ink-900 dark:hover:text-ink-050"
      >
        Abrir decisão no portal do TJPR
      </a>{" "}
      <span className="text-ink-500 dark:text-ink-500">({hostOf(source.url)})</span>
    </span>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function ReportFooter({ report }: { report: FinalReport }) {
  return (
    <footer className="flex flex-col gap-3 border-t border-ink-300 pt-4 text-xs text-ink-600 dark:border-ink-700 dark:text-ink-400">
      <p className="flex flex-wrap items-center gap-1.5">
        <span>{report.sample.analyzedDecisions} decisão(ões) analisada(s) em profundidade ·</span>
        <span>{report.sample.verifiedEvidence} citação(ões) conferida(s) na fonte original</span>
        <HelpHint entry={GLOSSARY.citacaoConferida} />
        <span>· {report.sample.omittedItems} item(ns) omitido(s) por falta de verificação.</span>
        <HelpHint entry={GLOSSARY.omissoes} />
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
      <dt className="text-ink-600 dark:text-ink-400">{label}:</dt>
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
