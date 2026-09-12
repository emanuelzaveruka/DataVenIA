"use client";

import React, { useState } from "react";
import type { PipelineStageEvent, NodeExecutionDetail } from "../../lib/workflow/pipeline-stage-event";

interface N8nExecutionViewProps {
  isOpen: boolean;
  onClose: () => void;
  events: PipelineStageEvent[];
  traceId?: string;
  runId?: string;
}

export function N8nExecutionView({ isOpen, onClose, events, traceId, runId }: N8nExecutionViewProps) {
  const [selectedNode, setSelectedNode] = useState<NodeExecutionDetail | null>(null);
  const [activeTab, setActiveTab] = useState<"input" | "output" | "logs" | "error">("output");

  if (!isOpen) return null;

  const nodes: NodeExecutionDetail[] = events.map((event, idx) => {
    if (event.nodeDetail) return event.nodeDetail;
    return {
      id: `node-${idx + 1}`,
      stage: event.stage,
      nodeName: event.label,
      status: event.status,
      durationMs: event.durationMs,
      logs: [`Step ${event.label} finalizado com status ${event.status}`],
    };
  });

  const getStatusBadge = (status: NodeExecutionDetail["status"]) => {
    switch (status) {
      case "COMPLETED":
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">✔ Success</span>;
      case "FAILED":
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">✖ Failed</span>;
      case "RUNNING":
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 animate-pulse">⏳ Running</span>;
      default:
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-slate-700 text-slate-400">⚪ Idle</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4 md:p-6 overflow-hidden">
      <div className="w-full max-w-6xl h-[90vh] bg-slate-900 border border-slate-800 rounded-xl shadow-2xl flex flex-col overflow-hidden text-slate-100 font-sans">
        {/* Header Estilo N8n Canvas */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-orange-500/20 border border-orange-500/40 flex items-center justify-center font-bold text-orange-400">
              N8n
            </div>
            <div>
              <h3 className="font-semibold text-lg text-slate-100 flex items-center gap-2">
                Execution Workflow Inspector
                <span className="text-xs bg-slate-800 text-slate-400 font-mono px-2 py-0.5 rounded border border-slate-700">
                  {nodes.length} Steps
                </span>
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                Trace ID: {traceId || "N/A"} | Run ID: {runId || "N/A"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg text-sm transition"
          >
            Fechar ✕
          </button>
        </div>

        {/* Main Content: Canvas Nodes + Side Inspector Panel */}
        <div className="flex-1 flex overflow-hidden">
          {/* Canvas de Nós / Flow Diagram */}
          <div className="flex-1 p-6 overflow-y-auto bg-slate-950/40 border-r border-slate-800 flex flex-col items-center gap-4">
            <div className="w-full max-w-xl flex flex-col items-stretch gap-3 py-4">
              {nodes.map((node, index) => {
                const isSelected = selectedNode?.id === node.id;

                return (
                  <React.Fragment key={node.id}>
                    {index > 0 && (
                      <div className="flex justify-center my-[-4px]">
                        <div className="w-0.5 h-6 bg-slate-700/80 flex items-center justify-center">
                          <span className="text-[10px] text-slate-500">▼</span>
                        </div>
                      </div>
                    )}
                    <div
                      onClick={() => {
                        setSelectedNode(node);
                        if (node.error) setActiveTab("error");
                        else if (node.output) setActiveTab("output");
                        else setActiveTab("input");
                      }}
                      className={`group relative flex items-center justify-between p-4 rounded-xl border transition cursor-pointer ${
                        node.status === "FAILED"
                          ? "bg-rose-950/20 border-rose-500/50 hover:border-rose-400"
                          : node.status === "COMPLETED"
                            ? "bg-slate-900 border-slate-800 hover:border-emerald-500/50"
                            : "bg-slate-900/50 border-slate-800 opacity-60"
                      } ${isSelected ? "ring-2 ring-orange-500/80 shadow-lg shadow-orange-500/10" : ""}`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-3 h-3 rounded-full ${
                            node.status === "COMPLETED"
                              ? "bg-emerald-400 shadow-sm shadow-emerald-400/50"
                              : node.status === "FAILED"
                                ? "bg-rose-500 shadow-sm shadow-rose-500/50"
                                : "bg-slate-500"
                          }`}
                        />
                        <div>
                          <h4 className="font-medium text-sm text-slate-200 group-hover:text-slate-100">
                            {node.nodeName}
                          </h4>
                          <span className="text-xs text-slate-400 font-mono">
                            Stage: {node.stage}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-400 font-mono">
                          {node.durationMs}ms
                        </span>
                        {getStatusBadge(node.status)}
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Side Drawer: Node Inspector (Input, Output, Error, Logs) */}
          <div className="w-[480px] bg-slate-900/90 flex flex-col border-l border-slate-800">
            {selectedNode ? (
              <>
                <div className="p-4 border-b border-slate-800 bg-slate-950/40">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono uppercase text-orange-400 font-bold">
                      Node Details
                    </span>
                    {getStatusBadge(selectedNode.status)}
                  </div>
                  <h4 className="font-semibold text-slate-100 text-base">
                    {selectedNode.nodeName}
                  </h4>
                  <p className="text-xs text-slate-400 font-mono mt-1">
                    Duração: {selectedNode.durationMs}ms | Concluído em:{" "}
                    {selectedNode.completedAt ? new Date(selectedNode.completedAt).toLocaleTimeString() : "N/A"}
                  </p>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-800 bg-slate-950/60 px-4 text-sm">
                  <button
                    onClick={() => setActiveTab("output")}
                    className={`px-3 py-2 border-b-2 font-medium transition ${
                      activeTab === "output"
                        ? "border-orange-500 text-orange-400"
                        : "border-transparent text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Output Payload
                  </button>
                  <button
                    onClick={() => setActiveTab("input")}
                    className={`px-3 py-2 border-b-2 font-medium transition ${
                      activeTab === "input"
                        ? "border-orange-500 text-orange-400"
                        : "border-transparent text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Input
                  </button>
                  <button
                    onClick={() => setActiveTab("logs")}
                    className={`px-3 py-2 border-b-2 font-medium transition ${
                      activeTab === "logs"
                        ? "border-orange-500 text-orange-400"
                        : "border-transparent text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Logs ({selectedNode.logs?.length || 0})
                  </button>
                  {selectedNode.error && (
                    <button
                      onClick={() => setActiveTab("error")}
                      className={`px-3 py-2 border-b-2 font-medium transition ${
                        activeTab === "error"
                          ? "border-rose-500 text-rose-400"
                          : "border-transparent text-rose-400/70 hover:text-rose-300"
                      }`}
                    >
                      ⚠️ Erro
                    </button>
                  )}
                </div>

                {/* Content Panel */}
                <div className="flex-1 p-4 overflow-y-auto font-mono text-xs bg-slate-950/30">
                  {activeTab === "output" && (
                    <pre className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-emerald-400 overflow-x-auto whitespace-pre-wrap">
                      {selectedNode.output
                        ? JSON.stringify(selectedNode.output, null, 2)
                        : "// Nenhum payload de saída registrado para este nó."}
                    </pre>
                  )}

                  {activeTab === "input" && (
                    <pre className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-sky-300 overflow-x-auto whitespace-pre-wrap">
                      {selectedNode.input
                        ? JSON.stringify(selectedNode.input, null, 2)
                        : "// Nenhum payload de entrada informado."}
                    </pre>
                  )}

                  {activeTab === "logs" && (
                    <div className="space-y-2">
                      {selectedNode.logs && selectedNode.logs.length > 0 ? (
                        selectedNode.logs.map((log, idx) => (
                          <div
                            key={idx}
                            className="p-2 rounded bg-slate-950 border border-slate-800/80 text-slate-300"
                          >
                            {log}
                          </div>
                        ))
                      ) : (
                        <p className="text-slate-500">// Nenhum log capturado.</p>
                      )}
                    </div>
                  )}

                  {activeTab === "error" && selectedNode.error && (
                    <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-500/40 text-rose-300 space-y-2">
                      <div className="font-bold text-sm text-rose-400">
                        [{selectedNode.error.code || "PIPELINE_ERROR"}] {selectedNode.error.message}
                      </div>
                      {selectedNode.error.description && (
                        <p className="text-xs text-rose-200">{String(selectedNode.error.description)}</p>
                      )}
                      {selectedNode.error.details && (
                        <pre className="mt-2 p-2 bg-slate-950/80 rounded text-[11px] overflow-x-auto">
                          {JSON.stringify(selectedNode.error.details, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-500">
                <div className="w-12 h-12 rounded-full bg-slate-800/50 flex items-center justify-center text-2xl mb-3">
                  🔍
                </div>
                <p className="text-sm font-medium text-slate-400">Nenhum nó selecionado</p>
                <p className="text-xs text-slate-500 mt-1">
                  Clique em qualquer nó do fluxo ao lado para inspecionar os detalhes de entrada, saída e logs.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
