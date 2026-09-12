import { MIN_VALID_SCRATCHPADS } from "../config/limits";

export type WorkflowStage =
  | "DOCUMENT_ANALYSIS"
  | "QUERY_GENERATION"
  | "SEARCH"
  | "SCRATCHPAD_GENERATION"
  | "CROSS_FILE_ANALYSIS"
  | "EVIDENCE_VERIFICATION"
  | "REPORT_GENERATION";

export type WorkflowStatus =
  | "UPLOADED"
  | "DOCUMENT_PARSED"
  | "CASE_ANALYZED"
  | "QUERIES_GENERATED"
  | "SEARCH_COMPLETE"
  | "DECISIONS_SELECTED"
  | "SCRATCHPADS_COMPLETE"
  | "CROSSFILE_COMPLETE"
  | "EVIDENCE_VERIFIED"
  | "REPORT_COMPLETE"
  | "PARTIAL_SUCCESS"
  | "FAILED"
  | "CANCELLED";

export interface WorkflowError {
  code: "INVALID_STAGE";
  message: string;
  currentStage: WorkflowStage;
  attemptedStage: WorkflowStage;
}

const STAGE_ORDER: readonly WorkflowStage[] = [
  "DOCUMENT_ANALYSIS",
  "QUERY_GENERATION",
  "SEARCH",
  "SCRATCHPAD_GENERATION",
  "CROSS_FILE_ANALYSIS",
  "EVIDENCE_VERIFICATION",
  "REPORT_GENERATION",
];

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
