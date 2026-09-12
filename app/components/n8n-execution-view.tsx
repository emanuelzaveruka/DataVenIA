"use client";

import { OrchestratorExecutionView } from "./orchestrator-execution-view";
import type { PipelineStageEvent } from "../../lib/workflow/pipeline-stage-event";

interface N8nExecutionViewProps {
  isOpen: boolean;
  onClose: () => void;
  events: PipelineStageEvent[];
  traceId?: string;
  runId?: string;
  isStreaming?: boolean;
}

export function N8nExecutionView(props: N8nExecutionViewProps) {
  return <OrchestratorExecutionView {...props} />;
}

export { OrchestratorExecutionView };
