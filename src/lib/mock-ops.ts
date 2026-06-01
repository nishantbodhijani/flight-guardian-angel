// Mock data for the ops dashboard. Replace with API calls to the
// Python/LangChain backend (server functions or websocket) when wired up.

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type SignalSource =
  | "weather"
  | "notam"
  | "news"
  | "rotation"
  | "crawler"
  | "historical"
  | "atc";

export type Signal = {
  id: string;
  source: SignalSource;
  severity: number; // 0..1
  evidence: string;
  ts: string;
};

export type FlightPrediction = {
  id: string;
  flightNo: string;
  tail: string;
  origin: string;
  destination: string;
  scheduledDep: string; // ISO
  etd: string; // ISO predicted
  risk: number; // 0..1
  level: RiskLevel;
  etaDeltaMin: number;
  confidence: number;
  topReasons: string[];
  recommendedActions: string[];
  signals: Signal[];
};

export type Tenant = {
  id: string;
  code: string;
  name: string;
  hub: string;
};

export const tenants: Tenant[] = [
  { id: "t1", code: "AI", name: "Air India", hub: "DEL" },
  { id: "t2", code: "6E", name: "IndiGo", hub: "DEL" },
  { id: "t3", code: "UK", name: "Vistara", hub: "BOM" },
  { id: "t4", code: "EK", name: "Emirates", hub: "DXB" },
];

export function levelFromRisk(r: number): RiskLevel {
  if (r >= 0.8) return "critical";
  if (r >= 0.6) return "high";
  if (r >= 0.35) return "medium";
  return "low";
}

export const riskClasses: Record<RiskLevel, string> = {
  low: "bg-risk-low/15 text-risk-low border-risk-low/30",
  medium: "bg-risk-med/15 text-risk-med border-risk-med/30",
  high: "bg-risk-high/15 text-risk-high border-risk-high/40",
  critical: "bg-risk-crit/20 text-risk-crit border-risk-crit/50",
};

export const sourceLabels: Record<SignalSource, string> = {
  weather: "Weather",
  notam: "NOTAM",
  news: "News",
  rotation: "Rotation",
  crawler: "Crawler",
  historical: "Historical",
  atc: "ATC Flow",
};

function inHours(h: number) {
  return new Date(Date.now() + h * 3600_000).toISOString();
}

export const mockFlights: FlightPrediction[] = [
  {
    id: "f1",
    flightNo: "AI302",
    tail: "VT-EXU",
    origin: "DEL",
    destination: "BOM",
    scheduledDep: inHours(1.2),
    etd: inHours(2.0),
    risk: 0.86,
    level: "critical",
    etaDeltaMin: 48,
    confidence: 0.78,
    topReasons: [
      "Inbound leg AI301 currently 50 min late",
      "Thunderstorms forecast at DEL 14:00–16:00 UTC",
      "DEL ground stop in effect (NOTAM A1234/26)",
    ],
    recommendedActions: [
      "Notify catering of 45m push",
      "Hold gate A12, do not reassign",
      "Pre-board PRM passengers early",
    ],
    signals: [
      { id: "s1", source: "rotation", severity: 0.9, evidence: "Inbound AI301 ETA +50m vs schedule", ts: inHours(-0.1) },
      { id: "s2", source: "weather", severity: 0.75, evidence: "TAF DEL: TSRA 14/16Z, vis 1200m", ts: inHours(-0.2) },
      { id: "s3", source: "notam", severity: 0.6, evidence: "Ground stop arrivals DEL 13:30–15:00Z", ts: inHours(-0.4) },
      { id: "s4", source: "historical", severity: 0.4, evidence: "AI302 Tue avg delay 22m last 90d", ts: inHours(-1) },
    ],
  },
  {
    id: "f2",
    flightNo: "AI144",
    tail: "VT-ANL",
    origin: "BOM",
    destination: "LHR",
    scheduledDep: inHours(2.5),
    etd: inHours(2.9),
    risk: 0.64,
    level: "high",
    etaDeltaMin: 25,
    confidence: 0.7,
    topReasons: [
      "ATC flow restriction over EGLL arrivals",
      "Light fog forecast at LHR landing window",
    ],
    recommendedActions: [
      "Notify connecting pax desk at LHR",
      "Brief crew on potential hold at destination",
    ],
    signals: [
      { id: "s5", source: "atc", severity: 0.7, evidence: "EUROCONTROL CTOT +22m assigned", ts: inHours(-0.15) },
      { id: "s6", source: "weather", severity: 0.5, evidence: "TAF EGLL: BR 06/09Z, vis 3000m", ts: inHours(-0.3) },
    ],
  },
  {
    id: "f3",
    flightNo: "AI805",
    tail: "VT-PPN",
    origin: "BLR",
    destination: "DEL",
    scheduledDep: inHours(3.4),
    etd: inHours(3.5),
    risk: 0.38,
    level: "medium",
    etaDeltaMin: 8,
    confidence: 0.62,
    topReasons: [
      "Mild ATC congestion at DEL arrival",
      "Inbound tail on schedule, no rotation risk",
    ],
    recommendedActions: ["Monitor; no action required yet"],
    signals: [
      { id: "s7", source: "atc", severity: 0.4, evidence: "DEL arrival rate reduced to 38/hr", ts: inHours(-0.1) },
      { id: "s8", source: "rotation", severity: 0.1, evidence: "Inbound AI804 on schedule", ts: inHours(-0.05) },
    ],
  },
  {
    id: "f4",
    flightNo: "AI864",
    tail: "VT-EJL",
    origin: "DEL",
    destination: "MAA",
    scheduledDep: inHours(4.1),
    etd: inHours(4.1),
    risk: 0.14,
    level: "low",
    etaDeltaMin: 0,
    confidence: 0.55,
    topReasons: ["All signals nominal"],
    recommendedActions: [],
    signals: [
      { id: "s9", source: "weather", severity: 0.1, evidence: "VFR conditions both ends", ts: inHours(-0.5) },
      { id: "s10", source: "historical", severity: 0.2, evidence: "AI864 Tue avg delay 6m last 90d", ts: inHours(-1) },
    ],
  },
  {
    id: "f5",
    flightNo: "AI121",
    tail: "VT-ALJ",
    origin: "DEL",
    destination: "EWR",
    scheduledDep: inHours(5.2),
    etd: inHours(5.7),
    risk: 0.71,
    level: "high",
    etaDeltaMin: 32,
    confidence: 0.74,
    topReasons: [
      "Crew duty time tight on inbound rotation",
      "Headwinds on NAT track adding block time",
      "News: EWR ATC staffing advisory",
    ],
    recommendedActions: [
      "Confirm crew legality with OCC",
      "Alert station EWR of revised ETA",
    ],
    signals: [
      { id: "s11", source: "rotation", severity: 0.65, evidence: "Inbound crew rest buffer 35m", ts: inHours(-0.2) },
      { id: "s12", source: "weather", severity: 0.5, evidence: "NAT winds +28kt headwind component", ts: inHours(-0.4) },
      { id: "s13", source: "news", severity: 0.55, evidence: "FAA advisory: EWR staffing tower", ts: inHours(-0.6) },
    ],
  },
];

export type AgentStatus = {
  name: string;
  status: "healthy" | "degraded" | "down";
  lastRun: string;
  signalsLastHour: number;
};

export const agentStatuses: AgentStatus[] = [
  { name: "Flight Data", status: "healthy", lastRun: inHours(-0.02), signalsLastHour: 312 },
  { name: "Weather", status: "healthy", lastRun: inHours(-0.05), signalsLastHour: 96 },
  { name: "NOTAM", status: "healthy", lastRun: inHours(-0.1), signalsLastHour: 18 },
  { name: "News", status: "degraded", lastRun: inHours(-0.4), signalsLastHour: 4 },
  { name: "Crawler", status: "healthy", lastRun: inHours(-0.08), signalsLastHour: 42 },
  { name: "Rotation", status: "healthy", lastRun: inHours(-0.03), signalsLastHour: 128 },
  { name: "Historical/ML", status: "healthy", lastRun: inHours(-0.5), signalsLastHour: 60 },
  { name: "LLM Fusion", status: "healthy", lastRun: inHours(-0.02), signalsLastHour: 87 },
  { name: "Notifier", status: "healthy", lastRun: inHours(-0.1), signalsLastHour: 11 },
];

export function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function fmtRel(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 60000;
  const m = Math.round(diff);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (m > -60 && m < 0) return `in ${-m}m`;
  const h = Math.round(m / 60);
  return h > 0 ? `${h}h ago` : `in ${-h}h`;
}
