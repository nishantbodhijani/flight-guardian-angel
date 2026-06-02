import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getLiveFlights, type LiveFlight, type RiskLevel } from "@/lib/flights.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Flight Delay Ops · Live Multi-Agent Console" },
      {
        name: "description",
        content:
          "Real-time delay risk console powered by live AviationStack flight data. Predict, explain, and act on delays in the next 6 hours.",
      },
    ],
  }),
  component: OpsConsole,
});

type Tenant = { id: string; code: string; name: string; hub: string };

const tenants: Tenant[] = [
  { id: "AI", code: "AI", name: "Air India", hub: "DEL" },
  { id: "6E", code: "6E", name: "IndiGo", hub: "DEL" },
  { id: "UK", code: "UK", name: "Vistara / Air India", hub: "BOM" },
  { id: "EK", code: "EK", name: "Emirates", hub: "DXB" },
  { id: "BA", code: "BA", name: "British Airways", hub: "LHR" },
  { id: "AA", code: "AA", name: "American Airlines", hub: "DFW" },
];

const levels: RiskLevel[] = ["critical", "high", "medium", "low"];

const riskClasses: Record<RiskLevel, string> = {
  low: "bg-risk-low/15 text-risk-low border-risk-low/30",
  medium: "bg-risk-med/15 text-risk-med border-risk-med/30",
  high: "bg-risk-high/15 text-risk-high border-risk-high/40",
  critical: "bg-risk-crit/20 text-risk-crit border-risk-crit/50",
};

function fmtTime(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtRel(iso: string) {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "—";
  const diff = (Date.now() - t) / 60000;
  const m = Math.round(diff);
  if (m < 1 && m > -1) return "just now";
  if (m >= 1 && m < 60) return `${m}m ago`;
  if (m <= -1 && m > -60) return `in ${-m}m`;
  const h = Math.round(m / 60);
  return h > 0 ? `${h}h ago` : `in ${-h}h`;
}

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

function OpsConsole() {
  const [tenantId, setTenantId] = useState(tenants[0].id);
  const [filter, setFilter] = useState<RiskLevel | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const tenant = tenants.find((t) => t.id === tenantId)!;
  const fetchLiveFlights = useServerFn(getLiveFlights);

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["flights", tenant.code],
    queryFn: () => fetchLiveFlights({ data: { airlineIata: tenant.code, limit: 50 } }),
    refetchInterval: 120_000, // refresh every 2 minutes
    staleTime: 60_000,
  });

  const allFlights: LiveFlight[] = data?.flights ?? [];
  const apiError = error ? (error as Error).message : data?.error ?? null;

  const flights = useMemo(() => {
    return filter === "all" ? allFlights : allFlights.filter((f) => f.level === filter);
  }, [allFlights, filter]);

  const selected: LiveFlight | undefined =
    flights.find((f) => f.id === selectedId) ?? flights[0];

  const counts = useMemo(() => {
    const c: Record<RiskLevel | "all", number> = {
      all: allFlights.length,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };
    for (const f of allFlights) c[f.level]++;
    return c;
  }, [allFlights]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-sidebar">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold">
              ✈
            </div>
            <div>
              <h1 className="text-sm font-semibold leading-none">Flight Delay Ops</h1>
              <p className="mt-1 text-xs text-muted-foreground">
                Live data · AviationStack · refresh 2m
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-xs text-muted-foreground">Airline</label>
            <select
              value={tenantId}
              onChange={(e) => {
                setTenantId(e.target.value);
                setSelectedId(null);
              }}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code} · {t.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold transition hover:bg-accent disabled:opacity-50"
            >
              {isFetching ? "Refreshing…" : "Refresh"}
            </button>
            <div className="hidden items-center gap-2 rounded-md bg-card px-3 py-1.5 text-xs text-muted-foreground md:flex">
              <span
                className={`size-1.5 rounded-full ${
                  isFetching ? "bg-risk-med animate-pulse" : "bg-risk-low"
                }`}
              />
              {data?.fetchedAt ? `Last fetch ${fmtRel(data.fetchedAt)}` : "Connecting…"}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1400px] gap-4 px-6 py-4 lg:grid-cols-[1fr_360px]">
        {/* Left column */}
        <div className="space-y-4">
          {apiError && (
            <div className="rounded-lg border border-risk-crit/40 bg-risk-crit/10 p-3 text-sm text-risk-crit">
              <strong>API error:</strong> {apiError}
              <div className="mt-1 text-xs opacity-80">
                Free AviationStack tier is limited to 100 calls/month and supports HTTP only.
                If you hit the cap, wait for the monthly reset or upgrade the plan.
              </div>
            </div>
          )}

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
                  <span
                    className={`size-2 rounded-full bg-risk-${
                      lvl === "critical" ? "crit" : lvl === "high" ? "high" : lvl === "medium" ? "med" : "low"
                    }`}
                  />
                </div>
                <div className="mt-2 text-2xl font-bold">{counts[lvl]}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">flights</div>
              </button>
            ))}
          </div>

          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
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
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-left font-medium">Risk</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={6} className="px-3 py-12 text-center text-sm text-muted-foreground">
                      Fetching live flights for {tenant.code}…
                    </td>
                  </tr>
                )}
                {!isLoading &&
                  flights.map((f) => (
                    <tr
                      key={f.id}
                      onClick={() => setSelectedId(f.id)}
                      className={`cursor-pointer border-t border-border transition hover:bg-accent/40 ${
                        selected?.id === f.id ? "bg-accent/60" : ""
                      }`}
                    >
                      <td className="px-3 py-2.5">
                        <div className="font-semibold">{f.flightIata}</div>
                        <div className="text-xs text-muted-foreground">{f.tail}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="font-mono">{f.origin}</span>
                        <span className="px-1 text-muted-foreground">→</span>
                        <span className="font-mono">{f.destination}</span>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs">
                        {fmtTime(f.scheduledDep)} → {fmtTime(f.estimatedDep)}
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
                          {f.etaDeltaMin > 0 ? `+${f.etaDeltaMin}m` : "on time"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs capitalize text-muted-foreground">
                        {f.status}
                      </td>
                      <td className="px-3 py-2.5">
                        <RiskBadge level={f.level} risk={f.risk} />
                      </td>
                    </tr>
                  ))}
                {!isLoading && flights.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                      No flights returned for {tenant.code}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Selected flight detail */}
          {selected && (
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold">{selected.flightIata}</h2>
                    <RiskBadge level={selected.level} risk={selected.risk} />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    <span className="font-mono">{selected.origin}</span>{" "}
                    <span className="text-xs">({selected.originName})</span> →{" "}
                    <span className="font-mono">{selected.destination}</span>{" "}
                    <span className="text-xs">({selected.destinationName})</span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Tail {selected.tail} · STD {fmtTime(selected.scheduledDep)} · ETD{" "}
                    {fmtTime(selected.estimatedDep)} · status {selected.status}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Delay
                  </div>
                  <div
                    className={`text-2xl font-bold ${
                      selected.etaDeltaMin >= 30
                        ? "text-risk-crit"
                        : selected.etaDeltaMin >= 15
                          ? "text-risk-high"
                          : "text-foreground"
                    }`}
                  >
                    +{selected.etaDeltaMin}m
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
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                <div className="rounded-md border border-border bg-background/40 p-2.5">
                  <div className="text-xs text-muted-foreground">Dep delay</div>
                  <div className="font-semibold">{selected.depDelayMin}m</div>
                </div>
                <div className="rounded-md border border-border bg-background/40 p-2.5">
                  <div className="text-xs text-muted-foreground">Arr delay</div>
                  <div className="font-semibold">{selected.arrDelayMin}m</div>
                </div>
                <div className="rounded-md border border-border bg-background/40 p-2.5">
                  <div className="text-xs text-muted-foreground">Status</div>
                  <div className="font-semibold capitalize">{selected.status}</div>
                </div>
                <div className="rounded-md border border-border bg-background/40 p-2.5">
                  <div className="text-xs text-muted-foreground">Risk score</div>
                  <div className="font-semibold">{Math.round(selected.risk * 100)}/100</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right column */}
        <aside className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Data sources
            </h3>
            <ul className="mt-3 space-y-2 text-sm">
              <li className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-risk-low" />
                  AviationStack (schedules + status)
                </span>
                <span className="text-xs text-muted-foreground">live</span>
              </li>
              <li className="flex items-center justify-between text-muted-foreground">
                <span className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-muted-foreground/50" />
                  Open-Meteo (weather)
                </span>
                <span className="text-xs">next</span>
              </li>
              <li className="flex items-center justify-between text-muted-foreground">
                <span className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-muted-foreground/50" />
                  OpenSky (live positions)
                </span>
                <span className="text-xs">next</span>
              </li>
              <li className="flex items-center justify-between text-muted-foreground">
                <span className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-muted-foreground/50" />
                  LLM Fusion (GPT-4o / Claude)
                </span>
                <span className="text-xs">roadmap</span>
              </li>
            </ul>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              High-risk alerts
            </h3>
            <ul className="mt-3 space-y-3 text-sm">
              {allFlights
                .filter((f) => f.risk >= 0.6)
                .slice(0, 8)
                .map((f) => (
                  <li key={f.id} className="border-l-2 border-risk-high pl-2">
                    <div className="font-semibold">
                      {f.flightIata} ·{" "}
                      <span className="text-risk-high">+{f.etaDeltaMin}m</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {f.origin} → {f.destination}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {f.topReasons[0]}
                    </div>
                  </li>
                ))}
              {allFlights.filter((f) => f.risk >= 0.6).length === 0 && (
                <li className="text-xs text-muted-foreground">
                  No high-risk flights right now.
                </li>
              )}
            </ul>
          </div>

          <div className="rounded-lg border border-dashed border-border bg-card/50 p-4 text-xs text-muted-foreground">
            <strong className="text-foreground">Note</strong>
            <p className="mt-1">
              Risk score is rule-based on actual departure/arrival delay returned by
              AviationStack. Weather, NOTAM and LLM fusion agents will refine this in the
              next phase.
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}
