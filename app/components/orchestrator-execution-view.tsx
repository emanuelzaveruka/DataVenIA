"use client";

import React, { useState } from "react";
import type { PipelineStageEvent, NodeExecutionDetail, AgentTaskInfo } from "../../lib/workflow/pipeline-stage-event";

interface OrchestratorExecutionViewProps {
  isOpen: boolean;
  onClose: () => void;
  events: PipelineStageEvent[];
  traceId?: string;
  runId?: string;
  isStreaming?: boolean;
}

interface SubAgentDefinition {
  id: string;
  name: string;
  role: string;
  icon: string;
  stages: string[];
  hus: string;
  description: string;
}

const SUB_AGENTS: SubAgentDefinition[] = [
  {
    id: "agent-ingestion",
    name: "Agente Ingestão & LGPD",
    role: "Parsing & Mascaramento PII",
    icon: "🛡️",
    stages: ["RECEIVED", "VALIDATING", "PARSING", "SANITIZING"],
    hus: "HU-01 a HU-06",
    description: "Valida extensões, extrai texto bruto (PDF/DOCX) e sanitiza dados pessoais (CPF, CNPJ, nomes) antes de qualquer envio a LLM.",
  },
  {
    id: "agent-case-understanding",
    name: "Agente Case Understanding",
    role: "Mapeamento de Fatos & Teses",
    icon: "🧠",
    stages: ["DOCUMENT_ANALYSIS"],
    hus: "HU-07, HU-08",
    description: "Analisa o documento sanitizado para identificar o objeto da causa, resumo factual e teses jurídicas centrais.",
  },
  {
    id: "agent-query-builder",
    name: "Agente Query Builder",
    role: "Estratégia de Pesquisa Jurídica",
    icon: "🎯",
    stages: ["QUERY_GENERATION"],
    hus: "HU-11",
    description: "Formula pesquisas booleanas e termos otimizados direcionados às Câmaras Cíveis do TJPR.",
  },
  {
    id: "agent-tjpr-crawler",
    name: "Agente TJPR Crawler & Pre-Rank",
    role: "Busca & Seleção no TJPR",
    icon: "🔍",
    stages: ["SEARCH"],
    hus: "HU-12 a HU-16",
    description: "Consulta a fonte de jurisprudência do TJPR, aplica funil de limites e pré-ranqueia acórdãos candidatos.",
  },
  {
    id: "agent-scratchpad-pool",
    name: "Pool de Agentes Scratchpad",
    role: "Análise Paralela de Acórdãos",
    icon: "⚡",
    stages: ["SCRATCHPAD_GENERATION"],
    hus: "HU-17 a HU-20",
    description: "Dispara workers paralelos para cada acórdão candidato, gerando Scratchpad Files isolados por proposição jurídica.",
  },
  {
    id: "agent-cross-file",
    name: "Agente Cross-File Analyst",
    role: "Confronto de Precedentes",
    icon: "⚖️",
    stages: ["CROSS_FILE_ANALYSIS"],
    hus: "HU-21 a HU-23",
    description: "Executa a etapa Reduce: compara as teses do caso com os Scratchpads (favoráveis, contrários, indeterminados).",
  },
  {
    id: "agent-evidence-verifier",
    name: "Agente Audit Evidence Verifier",
    role: "Auditoria Anti-Alucinação",
    icon: "🕵️",
    stages: ["EVIDENCE_VERIFICATION"],
    hus: "HU-24, HU-25",
    description: "Executa a etapa Verify: reabre os acórdãos originais do TJPR e valida citações contra a fonte autoritativa.",
  },
  {
    id: "agent-report-synthesizer",
    name: "Agente Sintetizador de Relatório",
    role: "Consolidação de Relatório Final",
    icon: "📄",
    stages: ["REPORT_GENERATION"],
    hus: "HU-26 a HU-29",
    description: "Consolida a análise em um relatório estruturado final com links para a jurisprudência oficial do TJPR.",
  },
];

export function OrchestratorExecutionView({
  isOpen,
  onClose,
  events,
  traceId,
  runId,
  isStreaming = false,
}: OrchestratorExecutionViewProps) {
  const [viewMode, setViewMode] = useState<"delegation" | "n8n">("delegation");
  const [selectedNode, setSelectedNode] = useState<NodeExecutionDetail | null>(null);
  const [selectedSubTask, setSelectedSubTask] = useState<AgentTaskInfo | null>(null);
  const [activeTab, setActiveTab] = useState<"output" | "input" | "logs" | "subtasks" | "error">("output");

  if (!isOpen) return null;

  // Build node detail list from events
  const nodes: NodeExecutionDetail[] = events.map((event, idx) => {
    if (event.nodeDetail) return event.nodeDetail;
    return {
      id: `node-${idx + 1}-${event.stage.toLowerCase()}`,
      stage: event.stage,
      nodeName: event.label,
      status: event.status,
      durationMs: event.durationMs,
      logs: [`Step ${event.label} finalizado com status ${event.status}`],
    };
  });

  // Calculate stats & active stage
  const completedNodes = nodes.filter((n) => n.status === "COMPLETED");
  const failedNodes = nodes.filter((n) => n.status === "FAILED");
  const runningNodes = nodes.filter((n) => n.status === "RUNNING");
  const activeNode = runningNodes[0] || (isStreaming && nodes.length > 0 ? nodes[nodes.length - 1] : null);

  const activeStage = activeNode?.stage;
  const isPipelineCompleted = completedNodes.length > 0 && !isStreaming && failedNodes.length === 0 && completedNodes.some(n => n.stage === "REPORT_GENERATION");

  const totalDuration = nodes.reduce((acc, n) => acc + (n.durationMs || 0), 0);

  const getSubAgentState = (subAgent: SubAgentDefinition) => {
    const matchingNodes = nodes.filter((n) => subAgent.stages.includes(n.stage));
    if (matchingNodes.some((n) => n.status === "FAILED")) return "FAILED";
    if (matchingNodes.some((n) => n.status === "RUNNING")) return "RUNNING";
    if (matchingNodes.length > 0 && matchingNodes.every((n) => n.status === "COMPLETED")) return "COMPLETED";
    if (matchingNodes.length > 0) return "RUNNING";
    return "IDLE";
  };

  const getStatusBadge = (status: "IDLE" | "RUNNING" | "COMPLETED" | "FAILED" | "SKIPPED") => {
    switch (status) {
      case "COMPLETED":
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">✔ Concluído</span>;
      case "FAILED":
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">✖ Falhou</span>;
      case "RUNNING":
        return (
          <span className="px-2 py-0.5 text-xs font-semibold rounded bg-amber-500/20 text-amber-400 border border-amber-500/40 animate-pulse flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
            Delegado / Executando
          </span>
        );
      default:
        return <span className="px-2 py-0.5 text-xs font-medium rounded bg-slate-800 text-slate-400 border border-slate-700/50">⚪ Aguardando</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-3 md:p-6 overflow-hidden">
      <div className="w-full max-w-7xl h-[92vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100 font-sans">
        {/* Header - Orchestrator Hub Banner */}
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-amber-500 p-0.5 shadow-lg shadow-indigo-500/20">
                <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center font-extrabold text-amber-400 text-lg">
                  🤖
                </div>
              </div>
              {isStreaming && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </span>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg text-slate-100 tracking-tight">
                  Orquestrador Data VênIA
                </h3>
                <span className="text-xs bg-indigo-500/20 text-indigo-300 font-mono px-2 py-0.5 rounded-full border border-indigo-500/30">
                  Map → Reduce → Verify Engine
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Trace ID: <span className="text-slate-300">{traceId || "N/A"}</span> | Run ID: <span className="text-slate-300">{runId || "N/A"}</span>
              </p>
            </div>
          </div>

          {/* Controls & View Switcher */}
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-medium">
              <button
                onClick={() => setViewMode("delegation")}
                className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
                  viewMode === "delegation"
                    ? "bg-indigo-600 text-white font-semibold shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <span>🤖 Visão Orquestrador</span>
              </button>
              <button
                onClick={() => setViewMode("n8n")}
                className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
                  viewMode === "n8n"
                    ? "bg-orange-600 text-white font-semibold shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <span>⚡ Inspector n8n</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-100 bg-slate-800 hover:bg-slate-700 px-3.5 py-1.5 rounded-xl text-sm font-medium transition border border-slate-700"
            >
              Fechar ✕
            </button>
          </div>
        </div>

        {/* Progress Bar Header Summary */}
        <div className="bg-slate-950/40 px-6 py-2 border-b border-slate-800/80 flex items-center justify-between text-xs font-mono text-slate-400">
          <div className="flex items-center gap-4">
            <span>Passos Concluídos: <strong className="text-emerald-400">{completedNodes.length}</strong> / {nodes.length || 8}</span>
            <span>Duração Total: <strong className="text-amber-400">{totalDuration}ms</strong></span>
            {isStreaming && <span className="text-amber-400 animate-pulse">⏳ Executando em Tempo Real...</span>}
          </div>
          <div>
            Status da Pipeline:{" "}
            {isPipelineCompleted ? (
              <span className="text-emerald-400 font-bold">✔ Finalizado com Éxito</span>
            ) : failedNodes.length > 0 ? (
              <span className="text-rose-400 font-bold">✖ Falhou</span>
            ) : (
              <span className="text-amber-400 font-bold">⏳ Em Processamento</span>
            )}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* LEFT: Main Visual Canvas */}
          <div className="flex-1 p-6 overflow-y-auto bg-slate-950/30 border-r border-slate-800">
            {viewMode === "delegation" ? (
              /* DELEGATION CANVAS MODE */
              <div className="flex flex-col gap-6 max-w-5xl mx-auto">
                {/* Central Orchestrator Banner Node */}
                <div className="relative p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/40 shadow-xl overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
                  
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center text-2xl shadow-inner">
                        🎯
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-100 text-base flex items-center gap-2">
                          Agente Orquestrador Principal
                          {isStreaming && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                              LIVE STREAMING
                            </span>
                          )}
                        </h4>
                        <p className="text-xs text-slate-300 mt-0.5">
                          Coordena a delegação sequencial e paralela de sub-tarefas especializadas, garantindo isolamento (Map), consolidação (Reduce) e auditoria anti-alucinação (Verify).
                        </p>
                      </div>
                    </div>
                  </div>

                  {activeNode && (
                    <div className="mt-4 pt-3 border-t border-indigo-500/20 flex items-center justify-between text-xs font-mono">
                      <div className="flex items-center gap-2">
                        <span className="text-indigo-400 font-bold">Delegando para:</span>
                        <span className="bg-indigo-900/60 text-indigo-200 px-2 py-1 rounded border border-indigo-500/30 font-semibold flex items-center gap-1.5">
                          <span>{activeNode.agentIcon || "🤖"}</span>
                          <span>{activeNode.agentName || activeNode.nodeName}</span>
                        </span>
                      </div>
                      <span className="text-amber-400 animate-pulse flex items-center gap-1">
                        <span>⚡ Conexão de Dados Ativa</span>
                      </span>
                    </div>
                  )}
                </div>

                {/* Sub-Agents Grid */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-mono uppercase text-slate-400 font-bold tracking-wider">
                      Sub-Agentes Especializados Delegados (8 Funções)
                    </h4>
                    <span className="text-xs text-slate-500 font-mono">Clique no agente para ver logs e payloads</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {SUB_AGENTS.map((subAgent) => {
                      const agentState = getSubAgentState(subAgent);
                      const matchingNodes = nodes.filter((n) => subAgent.stages.includes(n.stage));
                      const primaryNode = matchingNodes[matchingNodes.length - 1];
                      const isSelected = selectedNode?.id === primaryNode?.id;
                      const isActive = matchingNodes.some((n) => n.status === "RUNNING") || (isStreaming && matchingNodes.length > 0 && matchingNodes[matchingNodes.length - 1] === activeNode);

                      return (
                        <div
                          key={subAgent.id}
                          onClick={() => {
                            if (primaryNode) {
                              setSelectedNode(primaryNode);
                              setSelectedSubTask(null);
                              if (primaryNode.error) setActiveTab("error");
                              else if (primaryNode.subTasks && primaryNode.subTasks.length > 0) setActiveTab("subtasks");
                              else if (primaryNode.output) setActiveTab("output");
                              else setActiveTab("input");
                            }
                          }}
                          className={`group relative p-4 rounded-xl border transition-all duration-200 cursor-pointer overflow-hidden ${
                            agentState === "FAILED"
                              ? "bg-rose-950/20 border-rose-500/50 hover:border-rose-400"
                              : agentState === "COMPLETED"
                              ? "bg-slate-900 border-slate-800 hover:border-emerald-500/50"
                              : isActive
                              ? "bg-slate-900 border-amber-500/80 shadow-lg shadow-amber-500/10 ring-1 ring-amber-500/50"
                              : "bg-slate-900/40 border-slate-800/80 opacity-70 hover:opacity-100"
                          } ${isSelected ? "ring-2 ring-indigo-500 shadow-indigo-500/10" : ""}`}
                        >
                          {/* Animated Delegation Indicator */}
                          {isActive && (
                            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-amber-500 via-indigo-500 to-amber-500 animate-pulse" />
                          )}

                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <div
                                className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 border transition ${
                                  agentState === "COMPLETED"
                                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                    : agentState === "FAILED"
                                    ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
                                    : isActive
                                    ? "bg-amber-500/20 border-amber-500/40 text-amber-300 animate-bounce"
                                    : "bg-slate-800 border-slate-700 text-slate-400"
                                }`}
                              >
                                {subAgent.icon}
                              </div>

                              <div>
                                <div className="flex items-center gap-2">
                                  <h5 className="font-semibold text-sm text-slate-100 group-hover:text-amber-300 transition">
                                    {subAgent.name}
                                  </h5>
                                  <span className="text-[10px] font-mono bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700">
                                    {subAgent.hus}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-400 font-medium mt-0.5">
                                  {subAgent.role}
                                </p>
                              </div>
                            </div>

                            <div>{getStatusBadge(agentState)}</div>
                          </div>

                          <p className="text-xs text-slate-400 mt-2 line-clamp-2 leading-relaxed">
                            {subAgent.description}
                          </p>

                          {/* Subtasks or Execution details pill */}
                          {primaryNode && (
                            <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono text-slate-400">
                              <span>
                                Duração: <strong className="text-slate-200">{primaryNode.durationMs}ms</strong>
                              </span>

                              {primaryNode.subTasks && primaryNode.subTasks.length > 0 ? (
                                <span className="bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2 py-0.5 rounded">
                                  ⚡ {primaryNode.subTasks.length} Workers Paralelos
                                </span>
                              ) : primaryNode.output ? (
                                <span className="text-emerald-400 flex items-center gap-1">
                                  <span>Payload Saída OK</span>
                                </span>
                              ) : null}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              /* N8N CANVAS VIEW MODE */
              <div className="w-full max-w-xl mx-auto flex flex-col items-stretch gap-3 py-4">
                <div className="text-center mb-2">
                  <h4 className="text-sm font-bold text-slate-200">Inspetor de Fluxo Sequencial (Estilo n8n)</h4>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">Nós encadeados do pipeline de execução</p>
                </div>

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
                          setSelectedSubTask(null);
                          if (node.error) setActiveTab("error");
                          else if (node.subTasks && node.subTasks.length > 0) setActiveTab("subtasks");
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
                          <div className="text-lg">{node.agentIcon || "⚡"}</div>
                          <div>
                            <h4 className="font-medium text-sm text-slate-200 group-hover:text-slate-100">
                              {node.nodeName}
                            </h4>
                            <span className="text-xs text-slate-400 font-mono">
                              Agente: {node.agentName || node.stage}
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
            )}
          </div>

          {/* RIGHT: Node & Agent Inspector Drawer */}
          <div className="w-[480px] bg-slate-900/90 flex flex-col border-l border-slate-800">
            {selectedNode ? (
              <>
                {/* Node Inspector Header */}
                <div className="p-4 border-b border-slate-800 bg-slate-950/60">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-mono uppercase text-indigo-400 font-bold flex items-center gap-1.5">
                      <span>{selectedNode.agentIcon || "🤖"}</span>
                      <span>{selectedNode.agentName || "Detalhes do Agente"}</span>
                    </span>
                    {getStatusBadge(selectedNode.status)}
                  </div>
                  <h4 className="font-semibold text-slate-100 text-base">
                    {selectedNode.nodeName}
                  </h4>
                  {selectedNode.agentRole && (
                    <p className="text-xs text-slate-400 font-mono mt-0.5">
                      {selectedNode.agentRole}
                    </p>
                  )}
                  <p className="text-xs text-slate-400 font-mono mt-1 pt-1 border-t border-slate-800/60">
                    Duração: <strong className="text-slate-200">{selectedNode.durationMs}ms</strong> | Stage:{" "}
                    <span className="text-indigo-300 font-semibold">{selectedNode.stage}</span>
                  </p>
                </div>

                {/* Tabs Header */}
                <div className="flex border-b border-slate-800 bg-slate-950/80 px-4 text-xs font-medium overflow-x-auto">
                  <button
                    onClick={() => { setActiveTab("output"); setSelectedSubTask(null); }}
                    className={`px-3 py-2.5 border-b-2 transition font-mono whitespace-nowrap ${
                      activeTab === "output"
                        ? "border-indigo-500 text-indigo-400 font-bold"
                        : "border-transparent text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Output Payload
                  </button>
                  <button
                    onClick={() => { setActiveTab("input"); setSelectedSubTask(null); }}
                    className={`px-3 py-2.5 border-b-2 transition font-mono whitespace-nowrap ${
                      activeTab === "input"
                        ? "border-indigo-500 text-indigo-400 font-bold"
                        : "border-transparent text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Input Context
                  </button>

                  {selectedNode.subTasks && selectedNode.subTasks.length > 0 && (
                    <button
                      onClick={() => setActiveTab("subtasks")}
                      className={`px-3 py-2.5 border-b-2 transition font-mono whitespace-nowrap ${
                        activeTab === "subtasks"
                          ? "border-indigo-500 text-indigo-400 font-bold"
                          : "border-transparent text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Sub-Workers ({selectedNode.subTasks.length})
                    </button>
                  )}

                  <button
                    onClick={() => { setActiveTab("logs"); setSelectedSubTask(null); }}
                    className={`px-3 py-2.5 border-b-2 transition font-mono whitespace-nowrap ${
                      activeTab === "logs"
                        ? "border-indigo-500 text-indigo-400 font-bold"
                        : "border-transparent text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Logs ({selectedNode.logs?.length || 0})
                  </button>
                  {selectedNode.error && (
                    <button
                      onClick={() => { setActiveTab("error"); setSelectedSubTask(null); }}
                      className={`px-3 py-2.5 border-b-2 transition font-mono whitespace-nowrap ${
                        activeTab === "error"
                          ? "border-rose-500 text-rose-400 font-bold"
                          : "border-transparent text-rose-400/70 hover:text-rose-300"
                      }`}
                    >
                      ⚠️ Erro
                    </button>
                  )}
                </div>

                {/* Content Panel */}
                <div className="flex-1 p-4 overflow-y-auto font-mono text-xs bg-slate-950/40">
                  {activeTab === "output" && (
                    <pre className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-emerald-400 overflow-x-auto whitespace-pre-wrap leading-relaxed shadow-inner">
                      {selectedNode.output
                        ? JSON.stringify(selectedNode.output, null, 2)
                        : "// Nenhum payload de saída registrado para esta etapa."}
                    </pre>
                  )}

                  {activeTab === "input" && (
                    <pre className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-sky-300 overflow-x-auto whitespace-pre-wrap leading-relaxed shadow-inner">
                      {selectedNode.input
                        ? JSON.stringify(selectedNode.input, null, 2)
                        : "// Nenhum contexto de entrada registrado."}
                    </pre>
                  )}

                  {activeTab === "subtasks" && selectedNode.subTasks && (
                    <div className="space-y-3">
                      <p className="text-slate-400 font-sans text-xs">
                        Este nó executou <strong>{selectedNode.subTasks.length} sub-tarefas em paralelo</strong> (Scratchpad Workers):
                      </p>
                      <div className="space-y-2">
                        {selectedNode.subTasks.map((task) => {
                          const isTaskSelected = selectedSubTask?.id === task.id;
                          return (
                            <div
                              key={task.id}
                              onClick={() => setSelectedSubTask(isTaskSelected ? null : task)}
                              className={`p-3 rounded-xl border transition cursor-pointer ${
                                isTaskSelected
                                  ? "bg-indigo-950/40 border-indigo-500 text-indigo-200"
                                  : "bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-300"
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-xs text-amber-300">{task.name}</span>
                                {getStatusBadge(task.status)}
                              </div>
                              {Boolean(isTaskSelected && task.output) && (
                                <pre className="mt-2.5 p-2 rounded bg-slate-900 border border-slate-800 text-emerald-400 overflow-x-auto text-[11px]">
                                  {JSON.stringify(task.output, null, 2)}
                                </pre>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {activeTab === "logs" && (
                    <div className="space-y-2">
                      {selectedNode.logs && selectedNode.logs.length > 0 ? (
                        selectedNode.logs.map((log, idx) => (
                          <div
                            key={idx}
                            className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 text-slate-300 leading-relaxed"
                          >
                            {log}
                          </div>
                        ))
                      ) : (
                        <p className="text-slate-500">// Nenhum log capturado nesta etapa.</p>
                      )}
                    </div>
                  )}

                  {activeTab === "error" && selectedNode.error && (
                    <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-500/40 text-rose-300 space-y-3">
                      <div className="font-bold text-sm text-rose-400 flex items-center gap-2">
                        <span>⚠️ Erro na Execução do Sub-Agente</span>
                      </div>
                      <p className="text-xs text-rose-200 font-semibold">{selectedNode.error.message}</p>
                      {selectedNode.error.description && (
                        <p className="text-xs text-rose-300/80">{selectedNode.error.description}</p>
                      )}
                      {Boolean(selectedNode.error.details) && (
                        <pre className="mt-2 p-2.5 bg-slate-950 rounded-lg border border-rose-500/30 text-[11px] overflow-x-auto text-rose-200">
                          {JSON.stringify(selectedNode.error.details, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-500">
                <div className="w-14 h-14 rounded-2xl bg-slate-800/50 border border-slate-700/50 flex items-center justify-center text-3xl mb-3">
                  🔍
                </div>
                <p className="text-sm font-semibold text-slate-300">Nenhum Sub-Agente Selecionado</p>
                <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
                  Clique em qualquer cartão de sub-agente ou nó do fluxo ao lado para inspecionar parâmetros de entrada, payloads de saída, sub-tarefas paralelas e logs de auditabilidade.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
