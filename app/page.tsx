"use client";

import { useState } from "react";

/* ═══════════════════════════════════════════════════════════════════════════
   DATA
   ═══════════════════════════════════════════════════════════════════════════ */

const pipeline = [
  {
    id: "context",
    label: "CONTEXT_LOOKUP",
    tech: "Prior-case query",
    detail: "Queries prior cases before reading a single document. An entity resolved three months ago should not be re-extracted from scratch. A conflict with a prior case surfaces at the beginning, not after thirty seconds of extraction work.",
    model: null,
  },
  {
    id: "ingest",
    label: "DOC_INGEST",
    tech: "Claude 3.5 Sonnet · Structured Output",
    detail: "Each document is passed to claude-3-5-sonnet-20241022 with a typed Pydantic extraction schema. Constrained to produce specific fields with specific types, nulls where data is absent. A missing field triggers a compliance flag. A wrong field passes silently. Structured output ensures the failure mode is visible.",
    model: "claude-3-5-sonnet-20241022",
  },
  {
    id: "resolve",
    label: "ENTITY_RESOLVE",
    tech: "Graph construction · Dedup",
    detail: "The hardest problem in the pipeline. Not identifying entities — knowing when two references in different documents are the same entity. 'MWilliams Trust' and 'Marcus Williams Revocable Trust' are the same node. Getting this wrong creates phantom entities and incorrect compliance outcomes downstream.",
    model: null,
  },
  {
    id: "comply",
    label: "COMPLIANCE",
    tech: "Deterministic + LLM-assisted rules",
    detail: "Two fundamentally different rule types, strictly separated. Deterministic rules (KYC-001, KYC-002, IRA-001, IRA-002, IRA-003) operate on extracted field values only — no LLM in the path. LLM-assisted rules (ENT-001, KYC-003, TAX-001) handle irreducible judgment: reading legal structure against regulatory definitions.",
    model: "claude-3-5-sonnet-20241022",
  },
  {
    id: "summary",
    label: "SUMMARY",
    tech: "Composite risk score",
    detail: "Generates a human-readable recommendation with evidence links and pre-populated form fields. The compliance officer sees a decision with a reason, not a JSON object. Getting this last step right is what makes the pipeline useful rather than technically correct.",
    model: "claude-3-5-sonnet-20241022",
  },
];

const profiles = [
  {
    id: "sarah",
    label: "Happy Path",
    name: "Sarah Chen",
    account: "Roth IRA",
    docs: [
      { file: "passport.pdf", type: "government_id", fields: "DOB: 1991-03-15 · Exp: 2028-06-20", conf: 97 },
      { file: "operating_agreement.pdf", type: "entity_doc", fields: "TokenFlow Labs LLC · Delaware", conf: 94 },
      { file: "vesting_schedule.pdf", type: "vesting_doc", fields: "FLOW token · 50,000 units · $0.14/unit FMV", conf: 91 },
      { file: "cpa_letter.pdf", type: "accredited_investor", fields: "Apex Accounting LLP", conf: 96 },
    ],
    entities: [
      { name: "Sarah Chen", type: "Person" },
      { name: "TokenFlow Labs LLC", type: "LLC" },
    ],
    edges: [{ from: "Sarah Chen", to: "TokenFlow Labs LLC", rel: "beneficial_owner" }],
    rules: [
      { id: "KYC-001", label: "Government ID expiration", mode: "deterministic", status: "pass", note: "Passport valid until 2028" },
      { id: "KYC-002", label: "Required documents", mode: "deterministic", status: "pass", note: "Roth IRA: gov_id + accredited_investor" },
      { id: "KYC-003", label: "Accredited investor", mode: "llm", status: "pass", note: "CPA letter confirms net worth threshold" },
      { id: "ENT-002", label: "Beneficial ownership", mode: "llm", status: "pass", note: "Sarah Chen identified as sole owner" },
      { id: "IRA-001", label: "Contribution limits", mode: "deterministic", status: "pass", note: "Within $7,000 annual Roth limit" },
    ],
    outcome: "APPROVED",
    outcomeColor: "#22c55e",
  },
  {
    id: "marcus",
    label: "Complex Structure",
    name: "Marcus Williams",
    account: "SEP IRA",
    docs: [
      { file: "drivers_license.pdf", type: "government_id", fields: "DOB: 1978-11-04 · Exp: 2027-11-04", conf: 98 },
      { file: "decentravault_articles.pdf", type: "entity_doc", fields: "DecentraVault Inc · Corporation", conf: 93 },
      { file: "dv_holdings_agreement.pdf", type: "entity_doc", fields: "DecentraVault (50%) · Williams Trust (50%)", conf: 90 },
      { file: "williams_trust.pdf", type: "entity_doc", fields: "Grantor: Marcus Williams · Revocable", conf: 92 },
      { file: "k1_tax_return.pdf", type: "tax_doc", fields: "Partnership: DV Holdings LLC", conf: 88 },
      { file: "flow_vesting.pdf", type: "vesting_doc", fields: "FLOW · 2M units · $0.08/unit", conf: 90 },
      { file: "bridge_vesting.pdf", type: "vesting_doc", fields: "BRIDGE · 500K units · $0.25/unit", conf: 89 },
    ],
    entities: [
      { name: "Marcus Williams", type: "Person" },
      { name: "DecentraVault Inc", type: "Corp" },
      { name: "DV Holdings LLC", type: "LLC" },
      { name: "Williams Family Trust", type: "Trust" },
      { name: "SEP IRA", type: "Account" },
    ],
    edges: [
      { from: "Marcus Williams", to: "DecentraVault Inc", rel: "beneficial_owner" },
      { from: "DecentraVault Inc", to: "DV Holdings LLC", rel: "member (50%)" },
      { from: "Williams Family Trust", to: "DV Holdings LLC", rel: "member (50%)" },
      { from: "Marcus Williams", to: "Williams Family Trust", rel: "grantor" },
      { from: "DV Holdings LLC", to: "SEP IRA", rel: "funds_ira", prohibited: true },
      { from: "Williams Family Trust", to: "SEP IRA", rel: "funds_ira", prohibited: true },
    ],
    rules: [
      { id: "KYC-001", label: "Government ID expiration", mode: "deterministic", status: "pass", note: "License valid until 2027" },
      { id: "KYC-002", label: "Required documents", mode: "deterministic", status: "pass", note: "SEP IRA: gov_id + entity_doc" },
      { id: "IRA-001", label: "Contribution limits", mode: "deterministic", status: "fail", note: "Prohibited IRA contribution structure detected via entity chain" },
      { id: "ENT-001", label: "IRC 4975 prohibited transaction", mode: "llm", status: "fail", note: "DV Holdings LLC → SEP IRA with disqualified person chain" },
      { id: "ENT-002", label: "Beneficial ownership", mode: "llm", status: "warn", note: "Multi-layer ownership flagged for manual review" },
    ],
    outcome: "FLAGGED — REQUIRES REVIEW",
    outcomeColor: "#f59e0b",
  },
  {
    id: "priya",
    label: "Expired Document",
    name: "Priya Patel",
    account: "Roth IRA",
    docs: [
      { file: "expired_passport.pdf", type: "government_id", fields: "DOB: 1985-07-22 · Exp: 2023-01-10", conf: 97 },
      { file: "chainbridge_agreement.pdf", type: "entity_doc", fields: "ChainBridge DAO LLC · Wyoming", conf: 91 },
    ],
    entities: [{ name: "Priya Patel", type: "Person" }],
    edges: [],
    rules: [
      { id: "KYC-001", label: "Government ID expiration", mode: "deterministic", status: "fail", note: "Passport expired 2023-01-10 — 3+ years past expiry" },
      { id: "KYC-002", label: "Required documents", mode: "deterministic", status: "fail", note: "Insufficient documentation for Roth IRA" },
    ],
    outcome: "REJECTED",
    outcomeColor: "#ef4444",
  },
];

const techDecisions = [
  { name: "Cedar", status: "selected", domain: "Auth", reason: "Lean-verified formal correctness. 42-60x faster than OPA/Rego. Fail-closed default aligns with SEC audit." },
  { name: "SpiceDB", status: "selected", domain: "Auth", reason: "Reverse-query authorization. Cedar cannot answer 'what can this principal access?' without full candidate set." },
  { name: "PostgreSQL", status: "selected", domain: "Data", reason: "ACID non-negotiable for financial entity relationships. Recursive CTEs handle 3-6 hop ownership chains." },
  { name: "Temporal Cloud", status: "selected", domain: "Orch", reason: "Namespace-per-entity isolation. Worker Build IDs for safe version transitions. Durable execution for multi-day workflows." },
  { name: "Langfuse (self-hosted)", status: "selected", domain: "Obs", reason: "MIT license, OTel-compatible, telemetry disabled. No NPI egress. 0.25-0.5 FTE for ClickHouse ops." },
  { name: "Docling", status: "selected", domain: "Docs", reason: "Self-hosted, MIT, IBM-maintained. 97.9% table accuracy on DocLayNet. No data egress." },
  { name: "Bespoke-MiniCheck-7B", status: "selected", domain: "Eval", reason: "79.22% F1 on HaluEval, 8K token context. Replaced DeBERTa-v3 which fails silently at 512 tokens." },
  { name: "Qwen3-Embedding-8B", status: "selected", domain: "Embed", reason: "70.58 MTEB, 32K context, Apache 2.0. Self-hosted. +6.5pts over BGE-M3." },
  { name: "AWS Bedrock", status: "selected", domain: "LLM", reason: "Compliance whitepaper covering FINRA + SEC 17a-4(f). GDPA means model providers don't receive customer data." },
  { name: "Llama 3.3 70B", status: "selected", domain: "LLM", reason: "Self-hosted via vLLM for NPI-sensitive workflows. 19.8x lower inference cost than GPT-4o at scale." },
  { name: "Voyage AI", status: "rejected", domain: "Embed", reason: "No DPA. Direct Reg S-P violation. Applies to voyage-finance-2 and voyage-law-2 identically." },
  { name: "Azure Doc Intelligence", status: "rejected", domain: "Docs", reason: "Managed API = client documents leave firm perimeter. Triggers Reg S-P service provider obligations." },
  { name: "DeBERTa-v3-large", status: "rejected", domain: "Eval", reason: "512-token hard limit fails silently on multi-page authorization scope language." },
  { name: "LangSmith SaaS", status: "rejected", domain: "Obs", reason: "NPI in traces by design. No DPA available on standard tier." },
  { name: "Datadog LLM Obs", status: "rejected", domain: "Obs", reason: "SaaS-only. NPI leaves perimeter before server-side scrubbing." },
  { name: "CrewAI", status: "rejected", domain: "Orch", reason: "44% failure rate under load. Role-playing prompt pattern burns tokens." },
  { name: "LlamaParse", status: "rejected", domain: "Docs", reason: "0% cell placement accuracy on complex tables." },
  { name: "OPA/Rego", status: "rejected", domain: "Auth", reason: "Styra shutdown Aug 2025 removed commercial SLA backing." },
  { name: "pgvector (at scale)", status: "rejected", domain: "Data", reason: "Documented regret pattern at 5-10M vectors. HNSW RAM limits." },
  { name: "Semantic caching", status: "rejected", domain: "LLM", reason: "3-38% hit rates. GLBA/SOX controls on cached NPI. Net cost negative." },
  { name: "Neo4j", status: "deferred", domain: "Data", reason: "Recursive CTEs sufficient for typical chains. Apache AGE as upgrade path if depth > 6 hops." },
];

/* ═══════════════════════════════════════════════════════════════════════════
   COMPONENTS
   ═══════════════════════════════════════════════════════════════════════════ */

const mono = { fontFamily: "'IBM Plex Mono', monospace" };

function StatusDot({ status }: { status: string }) {
  const c = status === "pass" ? "#22c55e" : status === "fail" ? "#ef4444" : "#f59e0b";
  return <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c }} />;
}

function PipelineViz({ active, onSelect }: { active: number; onSelect: (i: number) => void }) {
  return (
    <div className="space-y-4">
      {/* Visual pipeline */}
      <div className="flex items-start gap-0 overflow-x-auto pb-2">
        {pipeline.map((node, i) => (
          <div key={node.id} className="flex items-center">
            <button
              onClick={() => onSelect(i)}
              className="flex flex-col items-center gap-2 px-2 group"
            >
              <div
                className="w-14 h-14 rounded-lg border-2 flex items-center justify-center transition-all relative"
                style={{
                  borderColor: active === i ? "#06b6d4" : "#1a1f2e",
                  backgroundColor: active === i ? "#06b6d411" : "#0c1018",
                  boxShadow: active === i ? "0 0 20px #06b6d422" : "none",
                }}
              >
                {active === i && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#06b6d4] animate-pulse" />
                )}
                <span className="text-[11px] font-bold" style={{ ...mono, color: active === i ? "#06b6d4" : "#64748b" }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <span className="text-[9px] text-center leading-tight max-w-[72px]"
                style={{ ...mono, color: active === i ? "#e2e8f0" : "#475569" }}>
                {node.label}
              </span>
            </button>
            {i < pipeline.length - 1 && (
              <div className="w-8 h-0.5 -mt-5 shrink-0 relative overflow-hidden" style={{ backgroundColor: "#1a1f2e" }}>
                <div className="absolute inset-0 h-full"
                  style={{
                    background: i < active ? "linear-gradient(90deg, #06b6d4, #06b6d4)" : "transparent",
                  }} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Detail panel */}
      <div className="rounded-xl border border-[#1a1f2e] bg-[#0c1018] p-5">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-xs font-bold" style={{ ...mono, color: "#06b6d4" }}>{pipeline[active].label}</span>
          {pipeline[active].model && (
            <span className="text-[10px] px-2 py-0.5 rounded border border-[#1a1f2e] text-[#64748b]" style={mono}>
              {pipeline[active].model}
            </span>
          )}
          <span className="text-[10px] text-[#475569]" style={mono}>{pipeline[active].tech}</span>
        </div>
        <p className="text-sm text-[#94a3b8] leading-relaxed">{pipeline[active].detail}</p>
      </div>
    </div>
  );
}

function EntityGraph({ profile }: { profile: typeof profiles[0] }) {
  if (profile.entities.length <= 2 && profile.edges.length <= 1) {
    // Simple graph - inline
    return (
      <div className="flex items-center gap-3 flex-wrap">
        {profile.entities.map((e) => (
          <div key={e.name} className="px-3 py-1.5 rounded-lg border border-[#1a1f2e] bg-[#0c1018]">
            <span className="text-xs text-[#e2e8f0]" style={mono}>{e.name}</span>
            <span className="text-[9px] text-[#475569] ml-2" style={mono}>{e.type}</span>
          </div>
        ))}
        {profile.edges.length > 0 && (
          <span className="text-[9px] text-[#475569]" style={mono}>{profile.edges[0].rel}</span>
        )}
      </div>
    );
  }

  // Complex graph - Marcus Williams ownership chain
  const nodePositions: Record<string, { x: number; y: number }> = {
    "Marcus Williams": { x: 50, y: 8 },
    "DecentraVault Inc": { x: 15, y: 38 },
    "Williams Family Trust": { x: 85, y: 38 },
    "DV Holdings LLC": { x: 50, y: 58 },
    "SEP IRA": { x: 50, y: 85 },
  };

  return (
    <div className="relative w-full" style={{ height: 320 }}>
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
        {profile.edges.map((edge, i) => {
          const from = nodePositions[edge.from];
          const to = nodePositions[edge.to];
          if (!from || !to) return null;
          const isProhibited = "prohibited" in edge && edge.prohibited;
          return (
            <g key={i}>
              <line x1={from.x} y1={from.y + 5} x2={to.x} y2={to.y - 2}
                stroke={isProhibited ? "#ef4444" : "#1a1f2e"}
                strokeWidth={isProhibited ? 0.5 : 0.3}
                strokeDasharray={isProhibited ? "1.5 1" : "none"} />
              <text x={(from.x + to.x) / 2 + 1} y={(from.y + to.y) / 2 + 2}
                fill={isProhibited ? "#ef4444" : "#475569"}
                fontSize="2.2" fontFamily="'IBM Plex Mono', monospace" textAnchor="middle">
                {edge.rel}
              </text>
            </g>
          );
        })}
      </svg>

      {profile.entities.map((entity) => {
        const pos = nodePositions[entity.name];
        if (!pos) return null;
        const isAccount = entity.type === "Account";
        return (
          <div key={entity.name} className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}>
            <div className="px-3 py-2 rounded-lg border text-center whitespace-nowrap"
              style={{
                borderColor: isAccount ? "#ef444444" : "#1a1f2e",
                backgroundColor: isAccount ? "#ef444411" : "#0c1018",
              }}>
              <div className="text-[10px] font-medium" style={{ ...mono, color: isAccount ? "#ef4444" : "#e2e8f0" }}>
                {entity.name}
              </div>
              <div className="text-[8px]" style={{ ...mono, color: "#475569" }}>{entity.type}</div>
            </div>
          </div>
        );
      })}

      {/* Prohibition callout */}
      {profile.id === "marcus" && (
        <div className="absolute bottom-0 left-0 right-0 flex justify-center">
          <div className="px-3 py-1.5 rounded border border-[#ef4444]/30 bg-[#ef4444]/5">
            <span className="text-[10px] text-[#ef4444] font-semibold" style={mono}>
              IRC 4975 PROHIBITED TRANSACTION — disqualified person chain detected
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function CaseWalkthrough() {
  const [active, setActive] = useState(1); // Start on Marcus (most interesting)
  const [tab, setTab] = useState<"docs" | "graph" | "rules">("graph");
  const p = profiles[active];

  return (
    <div className="space-y-4">
      {/* Profile tabs */}
      <div className="flex gap-2">
        {profiles.map((pr, i) => (
          <button key={pr.id} onClick={() => { setActive(i); setTab("graph"); }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border transition-all"
            style={{
              borderColor: active === i ? pr.outcomeColor + "66" : "#1a1f2e",
              backgroundColor: active === i ? pr.outcomeColor + "11" : "transparent",
            }}>
            <StatusDot status={pr.rules.some(r => r.status === "fail") ? "fail" : pr.rules.some(r => r.status === "warn") ? "warn" : "pass"} />
            <div className="text-left">
              <div className="text-xs font-medium" style={{ color: active === i ? "#e2e8f0" : "#64748b" }}>{pr.name}</div>
              <div className="text-[9px]" style={{ ...mono, color: "#475569" }}>{pr.label}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Content card */}
      <div className="rounded-xl border border-[#1a1f2e] bg-[#0c1018] overflow-hidden">
        {/* Sub-tabs */}
        <div className="flex border-b border-[#1a1f2e]">
          {(["docs", "graph", "rules"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest transition-all"
              style={{
                ...mono,
                color: tab === t ? "#06b6d4" : "#475569",
                borderBottom: tab === t ? "1px solid #06b6d4" : "1px solid transparent",
                backgroundColor: tab === t ? "#06b6d408" : "transparent",
              }}>
              {t === "docs" ? `DOCUMENTS (${p.docs.length})` : t === "graph" ? `ENTITY GRAPH (${p.entities.length})` : `COMPLIANCE (${p.rules.length})`}
            </button>
          ))}
        </div>

        <div className="p-5">
          {tab === "docs" && (
            <div className="grid gap-2">
              {p.docs.map((d) => (
                <div key={d.file} className="flex items-center gap-4 px-4 py-2.5 rounded-lg border border-[#1a1f2e] bg-[#08090f]">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-[#e2e8f0]" style={mono}>{d.file}</div>
                    <div className="text-[10px] text-[#475569]" style={mono}>{d.fields}</div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded border border-[#1a1f2e] text-[#64748b]" style={mono}>{d.type}</span>
                  <div className="w-10 text-right">
                    <span className="text-xs font-bold" style={{ ...mono, color: d.conf >= 95 ? "#22c55e" : d.conf >= 90 ? "#06b6d4" : "#f59e0b" }}>{d.conf}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "graph" && <EntityGraph profile={p} />}

          {tab === "rules" && (
            <div className="space-y-2">
              {p.rules.map((r) => (
                <div key={r.id} className="flex items-start gap-3 px-4 py-2.5 rounded-lg border border-[#1a1f2e] bg-[#08090f]">
                  <StatusDot status={r.status} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-[#e2e8f0]" style={mono}>{r.id}</span>
                      <span className="text-[10px] text-[#64748b]">{r.label}</span>
                    </div>
                    <div className="text-[10px] text-[#475569] mt-0.5" style={mono}>{r.note}</div>
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded border shrink-0" style={{
                    ...mono,
                    borderColor: r.mode === "deterministic" ? "#06b6d433" : "#8b5cf633",
                    color: r.mode === "deterministic" ? "#06b6d4" : "#8b5cf6",
                  }}>{r.mode}</span>
                </div>
              ))}
              <div className="flex items-center gap-3 pt-2 mt-2 border-t border-[#1a1f2e]">
                <span className="text-xs font-bold" style={{ ...mono, color: p.outcomeColor }}>{p.outcome}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TechGrid() {
  const [filter, setFilter] = useState<"all" | "selected" | "rejected" | "deferred">("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const filtered = filter === "all" ? techDecisions : techDecisions.filter(t => t.status === filter);
  const statusColors = { selected: "#22c55e", rejected: "#ef4444", deferred: "#f59e0b" };

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        {(["all", "selected", "rejected", "deferred"] as const).map(f => (
          <button key={f} onClick={() => { setFilter(f); setExpanded(null); }}
            className="px-3 py-1 rounded-md border text-[10px] font-semibold uppercase tracking-wide transition-all"
            style={{
              ...mono,
              borderColor: filter === f ? (f === "all" ? "#06b6d4" : statusColors[f as keyof typeof statusColors]) : "#1a1f2e",
              color: filter === f ? (f === "all" ? "#06b6d4" : statusColors[f as keyof typeof statusColors]) : "#475569",
              backgroundColor: filter === f ? (f === "all" ? "#06b6d411" : statusColors[f as keyof typeof statusColors] + "11") : "transparent",
            }}>
            {f} ({f === "all" ? techDecisions.length : techDecisions.filter(t => t.status === f).length})
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {filtered.map(t => (
          <button key={t.name} onClick={() => setExpanded(expanded === t.name ? null : t.name)}
            className="text-left rounded-lg border p-3 transition-all"
            style={{
              borderColor: expanded === t.name ? statusColors[t.status as keyof typeof statusColors] + "66" : "#1a1f2e",
              backgroundColor: expanded === t.name ? "#0c1018" : "#08090f",
            }}>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusColors[t.status as keyof typeof statusColors] }} />
              <span className="text-xs font-medium text-[#e2e8f0] truncate">{t.name}</span>
            </div>
            <span className="text-[9px] text-[#475569]" style={mono}>{t.domain}</span>
            {expanded === t.name && (
              <p className="text-[10px] text-[#94a3b8] mt-2 leading-relaxed border-t border-[#1a1f2e] pt-2">
                {t.reason}
              </p>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function EvalPyramid() {
  const [active, setActive] = useState<number | null>(null);
  const layers = [
    { label: "L5 — Production Monitoring", tech: "Langfuse · PSI/CSI drift · human override rate", detail: "Continuous monitoring via self-hosted Langfuse: human override rate, latency, cost per task type, and PSI/CSI drift detection on output distributions.", color: "#06b6d4", w: "100%" },
    { label: "L4 — Human Anchor Review", tech: "Golden dataset · quarterly", detail: "Quarterly human review on a golden dataset — the mechanism that detects judge drift over time. Without this, the evaluation system itself can drift undetected.", color: "#8b5cf6", w: "82%" },
    { label: "L3 — LLM-as-Judge", tech: "Position-swapped · dual-model-family", detail: "Position-swapped, dual-model-family evaluation. Single-model judges show up to 11% position bias (Zheng et al., NeurIPS 2023). For compliance outcomes, that is systematic error.", color: "#f59e0b", w: "64%" },
    { label: "L2 — NLI Grounding", tech: "Bespoke-MiniCheck-7B · 8K context", detail: "Sentence-level faithfulness checking of agent claims against source documents. Replaced DeBERTa-v3-large which fails silently on multi-page documents at 512 tokens.", color: "#f97316", w: "46%" },
    { label: "L1 — Schema Validation", tech: "Pydantic · typed output · nullable fields", detail: "Every agent output passes through Pydantic validation before reaching any downstream system. The first gate: if the output is not structurally valid, nothing else runs.", color: "#22c55e", w: "28%" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-1.5">
        {layers.map((l, i) => (
          <button key={l.label} onClick={() => setActive(active === i ? null : i)}
            className="rounded-lg border px-4 py-2 text-center transition-all"
            style={{
              width: l.w,
              borderColor: active === i ? l.color + "66" : "#1a1f2e",
              backgroundColor: active === i ? l.color + "11" : "#0c1018",
            }}>
            <div className="text-[10px] font-bold" style={{ ...mono, color: l.color }}>{l.label}</div>
            <div className="text-[9px] text-[#475569]" style={mono}>{l.tech}</div>
          </button>
        ))}
      </div>
      {active !== null && (
        <div className="rounded-xl border border-[#1a1f2e] bg-[#0c1018] p-4">
          <p className="text-sm text-[#94a3b8] leading-relaxed">{layers[active].detail}</p>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PAGE
   ═══════════════════════════════════════════════════════════════════════════ */

export default function ShowcasePage() {
  const [pipelineStep, setPipelineStep] = useState(0);

  return (
    <div className="min-h-screen text-[#e2e8f0]" style={{
      fontFamily: "system-ui, -apple-system, sans-serif",
      backgroundColor: "#06080e",
      backgroundImage: "linear-gradient(rgba(26,31,46,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(26,31,46,0.3) 1px, transparent 1px)",
      backgroundSize: "48px 48px",
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&display=swap');`}</style>

      {/* ── Hero ── */}
      <div className="relative overflow-hidden border-b border-[#1a1f2e]">
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse 60% 40% at 50% 0%, #06b6d410, transparent)" }} />
        <div className="max-w-4xl mx-auto px-6 sm:px-8 py-16 sm:py-24">
          <div className="flex items-center gap-3 mb-6">
            <span className="w-2 h-2 rounded-full bg-[#22c55e] animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#475569]" style={mono}>
              Document Intelligence for Complex Wealth Structures
            </span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4" style={{ ...mono, color: "#e2e8f0" }}>
            AURELIAN<span className="text-[#06b6d4]">_</span>OS
          </h1>
          <p className="text-[#64748b] text-base leading-relaxed max-w-xl mb-10">
            Autonomous compliance infrastructure for wealth management onboarding.
            From a working demo that proved the intelligence layer, to a research-validated
            production architecture for $1.14B in non-discretionary assets.
          </p>

          <div className="flex flex-wrap gap-3">
            {[
              { label: "Documents processed", value: "13", sub: "3 synthetic profiles" },
              { label: "Entities resolved", value: "8", sub: "6 relationships" },
              { label: "Compliance rules", value: "8", sub: "5 deterministic · 3 LLM" },
              { label: "Technologies evaluated", value: "21", sub: "10 selected · 10 rejected · 1 deferred" },
              { label: "Research domains", value: "19", sub: "ADRs post-validation" },
            ].map(s => (
              <div key={s.label} className="rounded-lg border border-[#1a1f2e] bg-[#0c1018] px-4 py-3 min-w-[130px]">
                <div className="text-xl font-bold" style={{ ...mono, color: "#06b6d4" }}>{s.value}</div>
                <div className="text-[10px] text-[#64748b]" style={mono}>{s.label}</div>
                <div className="text-[9px] text-[#475569] mt-0.5" style={mono}>{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 sm:px-8 py-16 space-y-20">

        {/* ── The Pipeline ── */}
        <section className="space-y-5">
          <div>
            <h2 className="text-lg font-bold" style={mono}>The Pipeline</h2>
            <p className="text-sm text-[#64748b] mt-1">Five LangGraph nodes. Click any stage to see what it does and why it exists.</p>
          </div>
          <PipelineViz active={pipelineStep} onSelect={setPipelineStep} />
        </section>

        {/* ── Live Case Walkthrough ── */}
        <section className="space-y-5">
          <div>
            <h2 className="text-lg font-bold" style={mono}>Case Walkthrough</h2>
            <p className="text-sm text-[#64748b] mt-1">
              Three synthetic profiles designed to cover distinct failure modes. Extraction results and compliance outcomes from actual API runs.
              Marcus Williams is the case that matters — a five-entity ownership chain with a prohibited transaction the pipeline traces through the graph.
            </p>
          </div>
          <CaseWalkthrough />
        </section>

        {/* ── Eval Framework ── */}
        <section className="space-y-5">
          <div>
            <h2 className="text-lg font-bold" style={mono}>Evaluation Framework</h2>
            <p className="text-sm text-[#64748b] mt-1">
              Five-layer pyramid anchored to SR 11-7 model risk management guidance. No examiner has tested any LLM validation methodology — documentation of rationale matters more than specific choices.
            </p>
          </div>
          <EvalPyramid />
        </section>

        {/* ── Technology Decisions ── */}
        <section className="space-y-5">
          <div>
            <h2 className="text-lg font-bold" style={mono}>Technology Decisions</h2>
            <p className="text-sm text-[#64748b] mt-1">
              21 technologies evaluated across 19 architectural domains. 10 rejected — most on Reg S-P compliance grounds, not technical capability. Click any to see the rationale.
            </p>
          </div>
          <TechGrid />
        </section>

        {/* ── The Distance ── */}
        <section className="space-y-5">
          <div>
            <h2 className="text-lg font-bold" style={mono}>Argus → Aurelian OS</h2>
            <p className="text-sm text-[#64748b] mt-1">
              Argus validates that the intelligence layer works. Aurelian OS is what happens when you accept that the intelligence layer is only one third of the problem.
            </p>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            {[
              { label: "Intelligence", pct: "33%", color: "#22c55e", items: ["Document extraction at high confidence", "Entity resolution across complex structures", "Deterministic + LLM-assisted compliance", "Structured output with typed validation"] },
              { label: "Compliance Infrastructure", pct: "33%", color: "#f97316", items: ["Cedar authorization + SpiceDB", "Bitemporal entity versioning", "Append-only audit trail", "Model inventory per SR 11-7"] },
              { label: "Operational Discipline", pct: "34%", color: "#06b6d4", items: ["Model version pinning (dated IDs)", "Cost attribution per task/tenant", "PSI/CSI drift detection", "Quarterly golden-set review"] },
            ].map(t => (
              <div key={t.label} className="rounded-xl border border-[#1a1f2e] bg-[#0c1018] p-4 space-y-3">
                <div>
                  <div className="text-xs font-bold" style={{ ...mono, color: t.color }}>{t.pct}</div>
                  <div className="text-sm font-medium text-[#e2e8f0] mt-0.5">{t.label}</div>
                </div>
                <div className="w-full h-1 rounded-full" style={{ backgroundColor: t.color + "22" }}>
                  <div className="h-1 rounded-full" style={{ backgroundColor: t.color, width: t.pct }} />
                </div>
                <ul className="space-y-1">
                  {t.items.map(item => (
                    <li key={item} className="text-[10px] text-[#64748b] flex gap-1.5" style={mono}>
                      <span style={{ color: t.color }}>-</span> {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* ── Footer ── */}
        <section className="border-t border-[#1a1f2e] pt-10">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}>
              <span className="text-white text-sm font-bold" style={mono}>AH</span>
            </div>
            <div>
              <div className="text-sm font-bold text-[#e2e8f0]">Anna Hervey</div>
              <div className="text-[10px] text-[#475569] mb-3" style={mono}>AI Engineer · Agent Systems · Compliance Infrastructure</div>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: "Resume", href: "/api/docs/anna-hervey-resume" },
                  { label: "LinkedIn", href: "https://linkedin.com/in/carterhervey" },
                  { label: "GitHub", href: "https://github.com/hyvra" },
                  { label: "Contact", href: "mailto:acarterhervey@gmail.com" },
                ].map(l => (
                  <a key={l.label} href={l.href} target={l.href.startsWith("http") ? "_blank" : undefined}
                    rel={l.href.startsWith("http") ? "noopener noreferrer" : undefined}
                    className="px-3 py-1.5 rounded-lg border border-[#1a1f2e] text-[10px] text-[#64748b] hover:text-[#06b6d4] hover:border-[#06b6d433] transition-all"
                    style={mono}>
                    {l.label}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
