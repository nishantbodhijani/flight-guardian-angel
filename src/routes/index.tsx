import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getLiveFlights,
  analyzeFlightWithAI,
  type LiveFlight,
  type RiskLevel,
  type WeatherSnapshot,
  type FlightAIBrief,
} from "@/lib/flights.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AirPulse AI · Enterprise Flight Ops Console" },
      {
        name: "description",
        content:
          "Enterprise-grade flight operations console fusing live schedules, weather, and AI reasoning to predict and act on delays.",
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

function WeatherChip({ w }: { w: WeatherSnapshot | null }) {
  if (!w) return <span className="text-xs text-muted-foreground">no wx</span>;
  const sev = w.severity;
  const color =
    sev >= 0.5 ? "text-risk-crit" : sev >= 0.3 ? "text-risk-high" : sev >= 0.15 ? "text-risk-med" : "text-risk-low";
  return (
    <span className={`text-xs ${color}`}>
      {w.airport} · {w.summary} · {w.gustKph}km/h
    </span>
  );
}

// Simple SVG histogram of delay distribution buckets
function DelayHistogram({ flights }: { flights: LiveFlight[] }) {
  const buckets = [
    { label: "on time", min: -Infinity, max: 5, color: "var(--risk-low)" },
    { label: "5-15m", min: 5, max: 15, color: "var(--risk-low)" },
    { label: "15-30m", min: 15, max: 30, color: "var(--risk-med)" },
    { label: "30-60m", min: 30, max: 60, color: "var(--risk-high)" },
    { label: "60m+", min: 60, max: Infinity, color: "var(--risk-crit)" },
  ];
  const counts = buckets.map(
    (b) => flights.filter((f) => f.etaDeltaMin >= b.min && f.etaDeltaMin < b.max).length,
  );
  const max = Math.max(1, ...counts);
  const W = 280;
  const H = 90;
  const bw = W / buckets.length;
  return (
    <svg viewBox={`0 0 ${W} ${H + 24}`} className="w-full">
      {buckets.map((b, i) => {
        const h = (counts[i] / max) * H;
        return (
          <g key={b.label}>
            <rect
              x={i * bw + 6}
              y={H - h}
              width={bw - 12}
              height={h}
              fill={b.color}
              opacity={0.85}
              rx={3}
            />
            <text
              x={i * bw + bw / 2}
              y={H - h - 4}
              fontSize={10}
              textAnchor="middle"
              fill="currentColor"
              className="text-foreground"
            >
              {counts[i]}
            </text>
            <text
              x={i * bw + bw / 2}
              y={H + 14}
              fontSize={9}
              textAnchor="middle"
              fill="currentColor"
              className="text-muted-foreground"
            >
              {b.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function OpsConsole() {
  const [tenantId, setTenantId] = useState(tenants[0].id);
  const [filter, setFilter] = useState<RiskLevel | "all">("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [aiBrief, setAiBrief] = useState<FlightAIBrief | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const tenant = tenants.find((t) => t.id === tenantId)!;
  const fetchLiveFlights = useServerFn(getLiveFlights);
  const analyzeFn = useServerFn(analyzeFlightWithAI);

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["flights", tenant.code],
    queryFn: () => fetchLiveFlights({ data: { airlineIata: tenant.code, limit: 50 } }),
    refetchInterval: 120_000,
    staleTime: 60_000,
  });

  const aiMutation = useMutation({
    mutationFn: (flight: LiveFlight) => analyzeFn({ data: { flight } }),
    onSuccess: (res) => {
      setAiBrief(res.brief);
      setAiError(res.error);
    },
    onError: (e) => setAiError((e as Error).message),
  });

  const allFlights: LiveFlight[] = data?.flights ?? [];
  const apiError = error ? (error as Error).message : data?.error ?? null;

  const flights = useMemo(() => {
    let list = filter === "all" ? allFlights : allFlights.filter((f) => f.level === filter);
    if (search.trim()) {
      const q = search.trim().toUpperCase();
      list = list.filter(
        (f) =>
          f.flightIata.toUpperCase().includes(q) ||
          f.origin.includes(q) ||
          f.destination.includes(q),
      );
    }
    return list;
  }, [allFlights, filter, search]);

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

  const otp = useMemo(() => {
    if (allFlights.length === 0) return 100;
    const ontime = allFlights.filter((f) => f.etaDeltaMin < 15).length;
    return Math.round((ontime / allFlights.length) * 100);
  }, [allFlights]);

  const avgDelay = useMemo(() => {
    if (allFlights.length === 0) return 0;
    return Math.round(
      allFlights.reduce((s, f) => s + Math.max(0, f.etaDeltaMin), 0) / allFlights.length,
    );
  }, [allFlights]);

  const runAI = (f: LiveFlight) => {
    setAiBrief(null);
    setAiError(null);
    aiMutation.mutate(f);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header
        className="border-b border-border"
        style={{ background: "var(--gradient-hero)" }}
      >
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div className="flex items-center gap-3">
            <div
              className="flex size-9 items-center justify-center rounded-md text-primary-foreground font-bold shadow-md"
              style={{ background: "var(--gradient-primary)" }}
            >
              ✈
            </div>
            <div>
              <h1 className="text-base font-semibold leading-none tracking-tight">
                AirPulse AI <span className="ml-1 text-xs font-normal text-muted-foreground">Enterprise</span>
              </h1>
              <p className="mt-1 text-xs text-muted-foreground">
                Live schedules · Weather fusion · AI reasoning · 2-min refresh
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search flight / airport (e.g. 6E302, DEL)"
              className="w-56 rounded-md border border-border bg-card/80 px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <select
              value={tenantId}
              onChange={(e) => {
                setTenantId(e.target.value);
                setSelectedId(null);
                setAiBrief(null);
              }}
              className="rounded-md border border-border bg-card/80 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
              className="rounded-md border border-border bg-card/80 px-3 py-1.5 text-xs font-semibold transition hover:bg-accent disabled:opacity-50"
            >
              {isFetching ? "Refreshing…" : "Refresh"}
            </button>
            <div className="hidden items-center gap-2 rounded-md bg-card/80 px-3 py-1.5 text-xs text-muted-foreground md:flex">
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

      <main className="mx-auto grid max-w-[1500px] gap-4 px-6 py-4 lg:grid-cols-[1fr_380px]">
        {/* Left column */}
        <div className="space-y-4">
          {apiError && (
            <div className="rounded-lg border border-risk-crit/40 bg-risk-crit/10 p-3 text-sm text-risk-crit">
              <strong>API error:</strong> {apiError}
              <div className="mt-1 text-xs opacity-80">
                Free AviationStack tier is limited to 100 calls/month. If the cap is hit,
                wait for the monthly reset or upgrade the plan.
              </div>
            </div>
          )}

          {/* KPI strip */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-border bg-card p-3" style={{ boxShadow: "var(--shadow-elevated)" }}>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Tracked</div>
              <div className="mt-1 text-2xl font-bold">{counts.all}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">flights live</div>
            </div>
            <div className="rounded-lg border border-border bg-card p-3" style={{ boxShadow: "var(--shadow-elevated)" }}>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">On-Time %</div>
              <div className={`mt-1 text-2xl font-bold ${otp >= 80 ? "text-risk-low" : otp >= 60 ? "text-risk-med" : "text-risk-high"}`}>
                {otp}%
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">{"<"}15m delay</div>
            </div>
            <div className="rounded-lg border border-border bg-card p-3" style={{ boxShadow: "var(--shadow-elevated)" }}>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Avg Delay</div>
              <div className="mt-1 text-2xl font-bold">{avgDelay}m</div>
              <div className="mt-0.5 text-xs text-muted-foreground">across fleet</div>
            </div>
            <div className="rounded-lg border border-border bg-card p-3" style={{ boxShadow: "var(--shadow-elevated)" }}>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">At Risk</div>
              <div className="mt-1 text-2xl font-bold text-risk-high">
                {counts.critical + counts.high}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {counts.critical} critical · {counts.high} high
              </div>
            </div>
          </div>

          {/* Distribution + filter */}
          <div className="grid gap-3 md:grid-cols-[1fr_320px]">
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Delay distribution
                </h3>
                <span className="text-xs text-muted-foreground">{tenant.code} fleet</span>
              </div>
              <DelayHistogram flights={allFlights} />
            </div>

            <div className="rounded-lg border border-border bg-card p-3">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Risk filter
              </h3>
              <div className="flex flex-wrap gap-2 text-xs">
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
                    onClick={() => setFilter(filter === lvl ? "all" : lvl)}
                    className={`rounded-md border px-2 py-1 capitalize ${
                      filter === lvl
                        ? "border-ring bg-accent"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {lvl} ({counts[lvl]})
                  </button>
                ))}
              </div>
            </div>
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
                  <th className="px-3 py-2 text-left font-medium">Weather</th>
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
                      onClick={() => {
                        setSelectedId(f.id);
                        setAiBrief(null);
                        setAiError(null);
                      }}
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
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col gap-0.5">
                          <WeatherChip w={f.originWeather} />
                          <WeatherChip w={f.destinationWeather} />
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <RiskBadge level={f.level} risk={f.risk} />
                      </td>
                    </tr>
                  ))}
                {!isLoading && flights.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                      No flights match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Selected flight detail */}
          {selected && (
            <div className="rounded-lg border border-border bg-card p-4" style={{ boxShadow: "var(--shadow-elevated)" }}>
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
                  <button
                    onClick={() => runAI(selected)}
                    disabled={aiMutation.isPending}
                    className="rounded-md px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-md transition hover:opacity-90 disabled:opacity-50"
                    style={{ background: "var(--gradient-primary)" }}
                  >
                    {aiMutation.isPending ? "Analyzing…" : "🤖 Run AI Brief"}
                  </button>
                  <div className="mt-2 text-xs uppercase tracking-wide text-muted-foreground">
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

              {/* AI brief panel */}
              {(aiBrief || aiError || aiMutation.isPending) && (
                <div className="mt-4 rounded-md border border-primary/30 bg-primary/5 p-3">
                  <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
                    🤖 AI Operations Brief
                    {aiBrief && (
                      <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-medium">
                        confidence: {aiBrief.confidence}
                      </span>
                    )}
                  </div>
                  {aiMutation.isPending && (
                    <p className="text-sm text-muted-foreground">Querying Gemini…</p>
                  )}
                  {aiError && <p className="text-sm text-risk-crit">{aiError}</p>}
                  {aiBrief && (
                    <div className="space-y-2 text-sm">
                      <p className="font-medium">{aiBrief.summary}</p>
                      <p className="text-muted-foreground">
                        <span className="font-semibold text-foreground">Root cause:</span>{" "}
                        {aiBrief.rootCause}
                      </p>
                      <p className="text-muted-foreground">
                        <span className="font-semibold text-foreground">Passenger impact:</span>{" "}
                        {aiBrief.passengerImpact}
                      </p>
                      <ul className="mt-1 space-y-1">
                        {aiBrief.actions.map((a, i) => (
                          <li key={i} className="flex gap-2 text-sm">
                            <span className="text-primary">▸</span>
                            <span>{a}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

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
                    Rule-based actions
                  </h3>
                  {selected.recommendedActions.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">None — monitor only.</p>
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

              {(selected.originWeather || selected.destinationWeather) && (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {[selected.originWeather, selected.destinationWeather].map((w, i) =>
                    w ? (
                      <div key={i} className="rounded-md border border-border bg-background/40 p-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold uppercase tracking-wide text-muted-foreground">
                            {i === 0 ? "Origin" : "Destination"} weather
                          </span>
                          <span className="font-mono">{w.airport}</span>
                        </div>
                        <div className="mt-1 text-sm font-semibold">
                          {w.summary} · {w.tempC}°C
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Wind {w.windKph} km/h · gusts {w.gustKph} km/h · vis{" "}
                          {w.visibilityKm} km · precip {w.precipitationMm}mm
                        </div>
                      </div>
                    ) : null,
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right column */}
        <aside className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Data fusion
            </h3>
            <ul className="mt-3 space-y-2 text-sm">
              <li className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-risk-low" />
                  AviationStack
                </span>
                <span className="text-xs text-muted-foreground">schedules · live</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-risk-low" />
                  Open-Meteo
                </span>
                <span className="text-xs text-muted-foreground">weather · live</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-risk-low" />
                  Lovable AI · Gemini
                </span>
                <span className="text-xs text-muted-foreground">reasoning · on demand</span>
              </li>
              <li className="flex items-center justify-between text-muted-foreground">
                <span className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-muted-foreground/50" />
                  OpenSky positions
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
                .slice(0, 10)
                .map((f) => (
                  <li
                    key={f.id}
                    onClick={() => setSelectedId(f.id)}
                    className="cursor-pointer border-l-2 border-risk-high pl-2 transition hover:border-risk-crit"
                  >
                    <div className="font-semibold">
                      {f.flightIata} ·{" "}
                      <span className="text-risk-high">+{f.etaDeltaMin}m</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {f.origin} → {f.destination}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
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
            <strong className="text-foreground">Enterprise readiness</strong>
            <p className="mt-1">
              Next: multi-tenant auth + RBAC (ops / manager / admin), persistent
              incident logs, Slack/Teams escalations, and crew-rotation impact graph.
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}
