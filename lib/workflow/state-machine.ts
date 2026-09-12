import { MIN_VALID_SCRATCHPADS } from "../config/limits";

/**
 * Estágios e status são `const` (e não só `type`) desde a Fase 8: a persistência de §11.8 valida a
 * coluna contra exatamente esta lista, então ela precisa existir em runtime. A ordem do array é a
 * ordem do pipeline — `STAGE_ORDER` abaixo deriva dela, em vez de repetir a sequência.
 */
export const WORKFLOW_STAGES = [
  "DOCUMENT_ANALYSIS",
  "QUERY_GENERATION",
  "SEARCH",
  "SCRATCHPAD_GENERATION",
  "CROSS_FILE_ANALYSIS",
  "EVIDENCE_VERIFICATION",
  "REPORT_GENERATION",
] as const;
export type WorkflowStage = (typeof WORKFLOW_STAGES)[number];

export const WORKFLOW_STATUSES = [
  "UPLOADED",
  "DOCUMENT_PARSED",
  "CASE_ANALYZED",
  "QUERIES_GENERATED",
  "SEARCH_COMPLETE",
  "DECISIONS_SELECTED",
  "SCRATCHPADS_COMPLETE",
  "CROSSFILE_COMPLETE",
  "EVIDENCE_VERIFIED",
  "REPORT_COMPLETE",
  "PARTIAL_SUCCESS",
  "FAILED",
  "CANCELLED",
] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

export interface WorkflowError {
  code: "INVALID_STAGE";
  message: string;
  currentStage: WorkflowStage;
  attemptedStage: WorkflowStage;
}

const STAGE_ORDER: readonly WorkflowStage[] = WORKFLOW_STAGES;

export interface WorkflowGuardContext {
  minValidScratchpads: number;
  validScratchpadCount: number;
  evidenceVerified: boolean;
}

function invalidStage(
  currentStage: WorkflowStage,
  attemptedStage: WorkflowStage,
  message: string,
): WorkflowError {
  return { code: "INVALID_STAGE", message, currentStage, attemptedStage };
}

export class Workflow {
  private currentStage: WorkflowStage = "DOCUMENT_ANALYSIS";
  private status: WorkflowStatus = "UPLOADED";

  getCurrentStage(): WorkflowStage {
    return this.currentStage;
  }

  getStatus(): WorkflowStatus {
    return this.status;
  }

  isToolAllowed(stage: WorkflowStage): boolean {
    return stage === this.currentStage;
  }

  advanceTo(target: WorkflowStage, guard?: Partial<WorkflowGuardContext>): void {
    const currentIndex = STAGE_ORDER.indexOf(this.currentStage);
    const targetIndex = STAGE_ORDER.indexOf(target);

    if (targetIndex !== currentIndex + 1) {
      throw invalidStage(
        this.currentStage,
        target,
        `Cannot advance to ${target} from ${this.currentStage}`,
      );
    }

    if (target === "CROSS_FILE_ANALYSIS") {
      const minRequired = guard?.minValidScratchpads ?? MIN_VALID_SCRATCHPADS;
      const actual = guard?.validScratchpadCount ?? 0;
      if (actual < minRequired) {
        throw invalidStage(
          this.currentStage,
          target,
          `CROSSFILE_COMPLETE requires at least ${minRequired} valid scratchpads, got ${actual}`,
        );
      }
    }

    if (target === "REPORT_GENERATION" && !guard?.evidenceVerified) {
      throw invalidStage(
        this.currentStage,
        target,
        "REPORT_GENERATION requires EVIDENCE_VERIFIED=true",
      );
    }

    this.currentStage = target;
  }

  setStatus(status: WorkflowStatus): void {
    this.status = status;
  }
}
