import { createServerFn } from "@tanstack/react-start";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type LiveFlight = {
  id: string;
  flightIata: string;
  flightNumber: string;
  airlineIata: string;
  airlineName: string;
  tail: string;
  origin: string;
  originName: string;
  destination: string;
  destinationName: string;
  scheduledDep: string; // ISO
  estimatedDep: string; // ISO (or scheduled if null)
  depDelayMin: number;
  arrDelayMin: number;
  status: string; // scheduled | active | landed | cancelled | incident | diverted
  risk: number; // 0..1
  level: RiskLevel;
  etaDeltaMin: number;
  topReasons: string[];
  recommendedActions: string[];
};

function levelFromRisk(r: number): RiskLevel {
  if (r >= 0.8) return "critical";
  if (r >= 0.6) return "high";
  if (r >= 0.35) return "medium";
  return "low";
}

function buildReasons(f: {
  status: string;
  depDelayMin: number;
  arrDelayMin: number;
}): { reasons: string[]; actions: string[] } {
  const reasons: string[] = [];
  const actions: string[] = [];

  if (f.status === "cancelled") {
    reasons.push("Flight cancelled by airline");
    actions.push("Re-accommodate passengers", "Notify station of cancellation");
  } else if (f.status === "diverted") {
    reasons.push("Flight diverted from original destination");
    actions.push("Coordinate with diversion airport", "Update connecting pax desks");
  } else if (f.depDelayMin >= 60) {
    reasons.push(`Departure delayed ${f.depDelayMin} min vs schedule`);
    actions.push("Notify catering and ground services", "Hold gate, do not reassign");
  } else if (f.depDelayMin >= 30) {
    reasons.push(`Departure delayed ${f.depDelayMin} min vs schedule`);
    actions.push("Brief crew on push-back delay", "Alert downstream rotation");
  } else if (f.depDelayMin >= 15) {
    reasons.push(`Minor departure delay (${f.depDelayMin}m) — monitor rotation`);
    actions.push("Monitor inbound tail for further slippage");
  }

  if (f.arrDelayMin >= 30 && f.status !== "cancelled") {
    reasons.push(`Estimated arrival delayed ${f.arrDelayMin} min`);
    actions.push("Notify connecting passenger desk at destination");
  }

  if (reasons.length === 0) reasons.push("All operational signals nominal");
  return { reasons, actions };
}

function computeRisk(depDelayMin: number, arrDelayMin: number, status: string): number {
  if (status === "cancelled" || status === "incident") return 0.95;
  if (status === "diverted") return 0.9;
  // Bigger delay -> higher risk. Map ~0-90 min linearly.
  const worst = Math.max(depDelayMin, arrDelayMin);
  const r = Math.min(0.95, worst / 90);
  return Math.max(0, r);
}

type AvStackFlight = {
  flight_date: string | null;
  flight_status: string | null;
  departure: {
    airport: string | null;
    iata: string | null;
    scheduled: string | null;
    estimated: string | null;
    actual: string | null;
    delay: number | null;
  } | null;
  arrival: {
    airport: string | null;
    iata: string | null;
    scheduled: string | null;
    estimated: string | null;
    delay: number | null;
  } | null;
  airline: { name: string | null; iata: string | null } | null;
  flight: { number: string | null; iata: string | null } | null;
  aircraft: { registration: string | null } | null;
};

export const getLiveFlights = createServerFn({ method: "GET" })
  .inputValidator((input: { airlineIata: string; limit?: number }) => {
    const code = String(input?.airlineIata ?? "").trim().toUpperCase();
    if (!/^[A-Z0-9]{2,3}$/.test(code)) throw new Error("Invalid airline IATA code");
    const limit = Math.min(Math.max(Number(input?.limit ?? 30), 1), 100);
    return { airlineIata: code, limit };
  })
  .handler(async ({ data }) => {
    const key = process.env.AVIATIONSTACK_API_KEY;
    if (!key) {
      return {
        flights: [] as LiveFlight[],
        error: "AVIATIONSTACK_API_KEY not configured on the server.",
        fetchedAt: new Date().toISOString(),
      };
    }

    // AviationStack free plan exposes HTTP only. Workers can call it fine.
    const url = `http://api.aviationstack.com/v1/flights?access_key=${encodeURIComponent(
      key,
    )}&airline_iata=${encodeURIComponent(data.airlineIata)}&limit=${data.limit}`;

    let payload: { data?: AvStackFlight[]; error?: { message?: string } } | null = null;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        return {
          flights: [],
          error: `AviationStack HTTP ${res.status}`,
          fetchedAt: new Date().toISOString(),
        };
      }
      payload = await res.json();
    } catch (e) {
      return {
        flights: [],
        error: `AviationStack request failed: ${e instanceof Error ? e.message : "unknown"}`,
        fetchedAt: new Date().toISOString(),
      };
    }

    if (payload?.error?.message) {
      return {
        flights: [],
        error: `AviationStack: ${payload.error.message}`,
        fetchedAt: new Date().toISOString(),
      };
    }

    const raw = payload?.data ?? [];
    const flights: LiveFlight[] = raw
      .filter((f) => f.flight?.iata && f.departure?.iata && f.arrival?.iata)
      .map((f, i): LiveFlight => {
        const depDelay = f.departure?.delay ?? 0;
        const arrDelay = f.arrival?.delay ?? 0;
        const status = (f.flight_status ?? "scheduled").toLowerCase();
        const risk = computeRisk(depDelay, arrDelay, status);
        const { reasons, actions } = buildReasons({
          status,
          depDelayMin: depDelay,
          arrDelayMin: arrDelay,
        });
        return {
          id: `${f.flight?.iata ?? "x"}-${f.flight_date ?? i}`,
          flightIata: f.flight?.iata ?? "",
          flightNumber: f.flight?.number ?? "",
          airlineIata: f.airline?.iata ?? data.airlineIata,
          airlineName: f.airline?.name ?? "",
          tail: f.aircraft?.registration ?? "—",
          origin: f.departure?.iata ?? "",
          originName: f.departure?.airport ?? "",
          destination: f.arrival?.iata ?? "",
          destinationName: f.arrival?.airport ?? "",
          scheduledDep: f.departure?.scheduled ?? "",
          estimatedDep:
            f.departure?.estimated ?? f.departure?.actual ?? f.departure?.scheduled ?? "",
          depDelayMin: depDelay,
          arrDelayMin: arrDelay,
          status,
          risk,
          level: levelFromRisk(risk),
          etaDeltaMin: Math.max(depDelay, arrDelay),
          topReasons: reasons,
          recommendedActions: actions,
        };
      })
      // Show riskiest first
      .sort((a, b) => b.risk - a.risk);

    return {
      flights,
      error: null as string | null,
      fetchedAt: new Date().toISOString(),
    };
  });
