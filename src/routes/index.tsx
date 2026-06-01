import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  agentStatuses,
  fmtRel,
  fmtTime,
  mockFlights,
  riskClasses,
  sourceLabels,
  tenants,
  type FlightPrediction,
  type RiskLevel,
} from "@/lib/mock-ops";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Flight Delay Ops · Multi-Agent Console" },
      {
        name: "description",
        content:
          "Real-time multi-agent delay risk console for airline operations. Predict, explain, and act on delays in the next 6 hours.",
      },
      { property: "og:title", content: "Flight Delay Ops · Multi-Agent Console" },
      {
        property: "og:description",
        content: "Real-time multi-agent delay risk console for airline operations.",
      },
    ],
  }),
  component: OpsConsole,
});

const levels: RiskLevel[] = ["critical", "high", "medium", "low"];

function RiskBadge({ level, risk }: { level: RiskLevel; risk: number }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${riskClasses[level]}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {level} · {Math.round(risk * 100)}
    </span>
  );
}

function AgentDot({ status }: { status: "healthy" | "degraded" | "down" }) {
  const cls =
    status === "healthy"
      ? "bg-risk-low"
      : status === "degraded"
        ? "bg-risk-med"
        : "bg-risk-crit";
  return <span className={`size-2 rounded-full ${cls}`} />;
}

function OpsConsole() {
  const [tenantId, setTenantId] = useState(tenants[0].id);
  const [filter, setFilter] = useState<RiskLevel | "all">("all");
  const [selectedId, setSelectedId] = useState<string>(mockFlights[0].id);

  const tenant = tenants.find((t) => t.id === tenantId)!;

  const flights = useMemo(() => {
    const sorted = [...mockFlights].sort((a, b) => b.risk - a.risk);
    return filter === "all" ? sorted : sorted.filter((f) => f.level === filter);
  }, [filter]);

  const selected: FlightPrediction =
    flights.find((f) => f.id === selectedId) ?? flights[0] ?? mockFlights[0];

  const counts = useMemo(() => {
    const c: Record<RiskLevel | "all", number> = {
      all: mockFlights.length,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };
    for (const f of mockFlights) c[f.level]++;
    return c;
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-sidebar">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold">
              ✈
            </div>
            <div>
              <h1 className="text-sm font-semibold leading-none">Flight Delay Ops</h1>
              <p className="mt-1 text-xs text-muted-foreground">
                Multi-agent delay intelligence · 0–6h window
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-xs text-muted-foreground">Tenant</label>
            <select
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code} · {t.name} ({t.hub})
                </option>
              ))}
            </select>
            <div className="hidden items-center gap-2 rounded-md bg-card px-3 py-1.5 text-xs text-muted-foreground md:flex">
              <span className="size-1.5 rounded-full bg-risk-low animate-pulse" />
              Live · last fuse 12s ago
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1400px] gap-4 px-6 py-4 lg:grid-cols-[1fr_360px]">
        {/* Left column */}
        <div className="space-y-4">
          {/* KPI strip */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {(["critical", "high", "medium", "low"] as RiskLevel[]).map((lvl) => (
              <button
                key={lvl}
                onClick={() => setFilter(filter === lvl ? "all" : lvl)}
                className={`rounded-lg border bg-card p-3 text-left transition hover:border-ring ${
                  filter === lvl ? "border-ring" : "border-border"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    {lvl}
                  </span>
                  <span className={`size-2 rounded-full bg-risk-${lvl === "critical" ? "crit" : lvl === "high" ? "high" : lvl === "medium" ? "med" : "low"}`} />
                </div>
                <div className="mt-2 text-2xl font-bold">{counts[lvl]}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">flights</div>
              </button>
            ))}
          </div>

          {/* Filter bar */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Filter:</span>
            <button
              onClick={() => setFilter("all")}
              className={`rounded-md border px-2 py-1 ${
                filter === "all"
                  ? "border-ring bg-accent"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              All ({counts.all})
            </button>
            {levels.map((lvl) => (
              <button
                key={lvl}
                onClick={() => setFilter(lvl)}
                className={`rounded-md border px-2 py-1 capitalize ${
                  filter === lvl
                    ? "border-ring bg-accent"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>

          {/* Flight list */}
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Flight</th>
                  <th className="px-3 py-2 text-left font-medium">Route</th>
                  <th className="px-3 py-2 text-left font-medium">STD → ETD</th>
                  <th className="px-3 py-2 text-left font-medium">Δ</th>
                  <th className="px-3 py-2 text-left font-medium">Risk</th>
                  <th className="px-3 py-2 text-left font-medium">Top reason</th>
                </tr>
              </thead>
              <tbody>
                {flights.map((f) => (
                  <tr
                    key={f.id}
                    onClick={() => setSelectedId(f.id)}
                    className={`cursor-pointer border-t border-border transition hover:bg-accent/40 ${
                      selected.id === f.id ? "bg-accent/60" : ""
                    }`}
                  >
                    <td className="px-3 py-2.5">
                      <div className="font-semibold">
                        {tenant.code} {f.flightNo.replace(/^[A-Z]+/, "")}
                      </div>
                      <div className="text-xs text-muted-foreground">{f.tail}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="font-mono">{f.origin}</span>
                      <span className="px-1 text-muted-foreground">→</span>
                      <span className="font-mono">{f.destination}</span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs">
                      {fmtTime(f.scheduledDep)} → {fmtTime(f.etd)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={
                          f.etaDeltaMin >= 30
                            ? "text-risk-crit font-semibold"
                            : f.etaDeltaMin >= 15
                              ? "text-risk-high font-semibold"
                              : f.etaDeltaMin > 0
                                ? "text-risk-med"
                                : "text-muted-foreground"
                        }
                      >
                        +{f.etaDeltaMin}m
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <RiskBadge level={f.level} risk={f.risk} />
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {f.topReasons[0]}
                    </td>
                  </tr>
                ))}
                {flights.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                      No flights match this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Selected flight detail */}
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold">
                    {tenant.code} {selected.flightNo.replace(/^[A-Z]+/, "")}
                  </h2>
                  <RiskBadge level={selected.level} risk={selected.risk} />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  <span className="font-mono">{selected.origin}</span> →{" "}
                  <span className="font-mono">{selected.destination}</span> · tail{" "}
                  {selected.tail} · STD {fmtTime(selected.scheduledDep)} · predicted ETD{" "}
                  {fmtTime(selected.etd)} (
                  <span className="text-foreground">+{selected.etaDeltaMin}m</span>)
                </p>
              </div>
              <div className="text-right">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Confidence
                </div>
                <div className="text-2xl font-bold">
                  {Math.round(selected.confidence * 100)}%
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Top reasons
                </h3>
                <ol className="mt-2 space-y-1.5 text-sm">
                  {selected.topReasons.map((r, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-muted-foreground">{i + 1}.</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ol>
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Recommended actions
                </h3>
                {selected.recommendedActions.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    None — monitor only.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {selected.recommendedActions.map((a, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-risk-med">▸</span>
                        <span>{a}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 flex gap-2">
                  <button className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90">
                    Send to ops Slack
                  </button>
                  <button className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold transition hover:bg-accent">
                    Mark useful
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Agent signals ({selected.signals.length})
              </h3>
              <div className="mt-2 space-y-2">
                {selected.signals.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 rounded-md border border-border bg-background/40 p-2.5"
                  >
                    <span className="min-w-20 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {sourceLabels[s.source]}
                    </span>
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full ${
                          s.severity >= 0.7
                            ? "bg-risk-crit"
                            : s.severity >= 0.45
                              ? "bg-risk-high"
                              : s.severity >= 0.25
                                ? "bg-risk-med"
                                : "bg-risk-low"
                        }`}
                        style={{ width: `${Math.round(s.severity * 100)}%` }}
                      />
                    </div>
                    <span className="flex-1 text-sm">{s.evidence}</span>
                    <span className="text-xs text-muted-foreground">{fmtRel(s.ts)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right column */}
        <aside className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Agent health
            </h3>
            <ul className="mt-3 space-y-2">
              {agentStatuses.map((a) => (
                <li key={a.name} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <AgentDot status={a.status} />
                    {a.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {a.signalsLastHour}/h · {fmtRel(a.lastRun)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Recent alerts
            </h3>
            <ul className="mt-3 space-y-3 text-sm">
              {mockFlights
                .filter((f) => f.risk >= 0.6)
                .map((f) => (
                  <li key={f.id} className="border-l-2 border-risk-high pl-2">
                    <div className="font-semibold">
                      {tenant.code} {f.flightNo.replace(/^[A-Z]+/, "")} ·{" "}
                      <span className="text-risk-high">+{f.etaDeltaMin}m risk</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{f.topReasons[0]}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      Slack #ops-{tenant.code.toLowerCase()} · {fmtRel(f.scheduledDep)}
                    </div>
                  </li>
                ))}
            </ul>
          </div>

          <div className="rounded-lg border border-dashed border-border bg-card/50 p-4 text-xs text-muted-foreground">
            <strong className="text-foreground">Backend wiring</strong>
            <p className="mt-1">
              This console reads mock data. Replace{" "}
              <code className="rounded bg-background/60 px-1">src/lib/mock-ops.ts</code> with
              a server function that proxies your Python/LangChain orchestrator, or open a
              WebSocket to the fusion agent for live signal updates.
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}
