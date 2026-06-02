import { createServerFn } from "@tanstack/react-start";
import { AIRPORTS } from "./airports";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type WeatherSnapshot = {
  airport: string;
  city: string;
  tempC: number;
  windKph: number;
  gustKph: number;
  visibilityKm: number;
  precipitationMm: number;
  weatherCode: number;
  summary: string;
  severity: number; // 0..1
};

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
  scheduledDep: string;
  estimatedDep: string;
  depDelayMin: number;
  arrDelayMin: number;
  status: string;
  risk: number;
  level: RiskLevel;
  etaDeltaMin: number;
  topReasons: string[];
  recommendedActions: string[];
  originWeather: WeatherSnapshot | null;
  destinationWeather: WeatherSnapshot | null;
};

function levelFromRisk(r: number): RiskLevel {
  if (r >= 0.8) return "critical";
  if (r >= 0.6) return "high";
  if (r >= 0.35) return "medium";
  return "low";
}

// WMO weather code → short label
const WMO: Record<number, string> = {
  0: "Clear",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Rain showers",
  81: "Heavy showers",
  82: "Violent showers",
  85: "Snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm w/ hail",
  99: "Severe thunderstorm",
};

function weatherSeverity(w: Omit<WeatherSnapshot, "severity" | "summary">): number {
  let s = 0;
  // Thunderstorm / severe codes
  if ([95, 96, 99].includes(w.weatherCode)) s += 0.6;
  else if ([65, 75, 82, 86].includes(w.weatherCode)) s += 0.45;
  else if ([45, 48, 55, 63, 73, 81, 85].includes(w.weatherCode)) s += 0.25;
  else if ([51, 53, 61, 71, 80].includes(w.weatherCode)) s += 0.1;
  // Wind / gust
  if (w.gustKph >= 60) s += 0.25;
  else if (w.gustKph >= 40) s += 0.15;
  else if (w.windKph >= 35) s += 0.08;
  // Visibility
  if (w.visibilityKm < 1) s += 0.3;
  else if (w.visibilityKm < 3) s += 0.18;
  else if (w.visibilityKm < 5) s += 0.08;
  return Math.min(1, s);
}

async function fetchWeather(iata: string): Promise<WeatherSnapshot | null> {
  const coords = AIRPORTS[iata];
  if (!coords) return null;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,wind_speed_10m,wind_gusts_10m,visibility,precipitation,weather_code&wind_speed_unit=kmh`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const j = (await res.json()) as {
      current?: {
        temperature_2m: number;
        wind_speed_10m: number;
        wind_gusts_10m: number;
        visibility: number;
        precipitation: number;
        weather_code: number;
      };
    };
    const c = j.current;
    if (!c) return null;
    const base = {
      airport: iata,
      city: coords.city,
      tempC: Math.round(c.temperature_2m),
      windKph: Math.round(c.wind_speed_10m),
      gustKph: Math.round(c.wind_gusts_10m),
      visibilityKm: Math.round((c.visibility / 1000) * 10) / 10,
      precipitationMm: c.precipitation,
      weatherCode: c.weather_code,
    };
    const severity = weatherSeverity(base);
    return {
      ...base,
      summary: WMO[c.weather_code] ?? "Unknown",
      severity,
    };
  } catch {
    return null;
  }
}

function buildReasons(f: {
  status: string;
  depDelayMin: number;
  arrDelayMin: number;
  origin: WeatherSnapshot | null;
  destination: WeatherSnapshot | null;
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

  for (const w of [f.origin, f.destination]) {
    if (!w) continue;
    if (w.severity >= 0.4) {
      reasons.push(`${w.city} (${w.airport}) weather: ${w.summary}, gusts ${w.gustKph} km/h, vis ${w.visibilityKm} km`);
      if ([95, 96, 99].includes(w.weatherCode)) {
        actions.push(`Coordinate with ${w.airport} ATC for thunderstorm avoidance`);
      } else if (w.visibilityKm < 3) {
        actions.push(`Brief crew on low-visibility ops at ${w.airport}`);
      } else if (w.gustKph >= 40) {
        actions.push(`Expect crosswind operations at ${w.airport}`);
      }
    }
  }

  if (reasons.length === 0) reasons.push("All operational signals nominal");
  return { reasons, actions };
}

function computeRisk(
  depDelayMin: number,
  arrDelayMin: number,
  status: string,
  weatherSev: number,
): number {
  if (status === "cancelled" || status === "incident") return 0.95;
  if (status === "diverted") return 0.9;
  const worst = Math.max(depDelayMin, arrDelayMin);
  const delayRisk = Math.min(0.9, worst / 90);
  // Combine delay + weather without exceeding 0.95
  const combined = 1 - (1 - delayRisk) * (1 - weatherSev * 0.7);
  return Math.min(0.95, Math.max(0, combined));
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

    const raw = (payload?.data ?? []).filter(
      (f) => f.flight?.iata && f.departure?.iata && f.arrival?.iata,
    );

    // Collect unique airports to fetch weather for (bounded by lookup table)
    const airportSet = new Set<string>();
    for (const f of raw) {
      const o = f.departure?.iata ?? "";
      const d = f.arrival?.iata ?? "";
      if (AIRPORTS[o]) airportSet.add(o);
      if (AIRPORTS[d]) airportSet.add(d);
    }
    const weatherEntries = await Promise.all(
      [...airportSet].map(async (a) => [a, await fetchWeather(a)] as const),
    );
    const weatherMap = new Map<string, WeatherSnapshot | null>(weatherEntries);

    const flights: LiveFlight[] = raw
      .map((f, i): LiveFlight => {
        const depDelay = f.departure?.delay ?? 0;
        const arrDelay = f.arrival?.delay ?? 0;
        const status = (f.flight_status ?? "scheduled").toLowerCase();
        const origin = f.departure?.iata ?? "";
        const destination = f.arrival?.iata ?? "";
        const originWeather = weatherMap.get(origin) ?? null;
        const destinationWeather = weatherMap.get(destination) ?? null;
        const weatherSev = Math.max(
          originWeather?.severity ?? 0,
          destinationWeather?.severity ?? 0,
        );
        const risk = computeRisk(depDelay, arrDelay, status, weatherSev);
        const { reasons, actions } = buildReasons({
          status,
          depDelayMin: depDelay,
          arrDelayMin: arrDelay,
          origin: originWeather,
          destination: destinationWeather,
        });
        return {
          id: `${f.flight?.iata ?? "x"}-${f.flight_date ?? i}`,
          flightIata: f.flight?.iata ?? "",
          flightNumber: f.flight?.number ?? "",
          airlineIata: f.airline?.iata ?? data.airlineIata,
          airlineName: f.airline?.name ?? "",
          tail: f.aircraft?.registration ?? "—",
          origin,
          originName: f.departure?.airport ?? "",
          destination,
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
          originWeather,
          destinationWeather,
        };
      })
      .sort((a, b) => b.risk - a.risk);

    return {
      flights,
      error: null as string | null,
      fetchedAt: new Date().toISOString(),
    };
  });

// ============================================================
// AI Reasoning Agent — Lovable AI Gateway (Gemini)
// ============================================================

export type FlightAIBrief = {
  summary: string;
  rootCause: string;
  passengerImpact: string;
  actions: string[];
  confidence: "low" | "medium" | "high";
};

export const analyzeFlightWithAI = createServerFn({ method: "POST" })
  .inputValidator((input: { flight: LiveFlight }) => {
    if (!input?.flight?.flightIata) throw new Error("flight required");
    return input;
  })
  .handler(async ({ data }): Promise<{ brief: FlightAIBrief | null; error: string | null }> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { brief: null, error: "LOVABLE_API_KEY not configured" };
    }
    const f = data.flight;
    const weather = (w: WeatherSnapshot | null) =>
      w
        ? `${w.city} (${w.airport}): ${w.summary}, ${w.tempC}°C, wind ${w.windKph} km/h gusts ${w.gustKph} km/h, vis ${w.visibilityKm} km`
        : "n/a";

    const prompt = `You are a senior airline operations controller. Analyze this flight and produce a concise ops brief.

Flight: ${f.flightIata} (${f.airlineName})
Route: ${f.origin} ${f.originName} → ${f.destination} ${f.destinationName}
Status: ${f.status}
Departure delay: ${f.depDelayMin} min
Arrival delay: ${f.arrDelayMin} min
Origin weather: ${weather(f.originWeather)}
Destination weather: ${weather(f.destinationWeather)}
Risk score: ${Math.round(f.risk * 100)}/100 (${f.level})

Return ONLY valid JSON matching this schema:
{
  "summary": "1-sentence operational summary",
  "rootCause": "1-2 sentence root cause analysis",
  "passengerImpact": "1 sentence on passenger impact",
  "actions": ["3-5 concrete prioritized actions"],
  "confidence": "low|medium|high"
}`;

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content:
                "You are an airline operations expert. Always respond with valid JSON only, no markdown fences.",
            },
            { role: "user", content: prompt },
          ],
        }),
      });

      if (res.status === 429) return { brief: null, error: "AI rate limit reached, try again shortly." };
      if (res.status === 402) return { brief: null, error: "AI credits exhausted." };
      if (!res.ok) return { brief: null, error: `AI gateway HTTP ${res.status}` };

      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = json.choices?.[0]?.message?.content ?? "";
      const cleaned = content.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
      const brief = JSON.parse(cleaned) as FlightAIBrief;
      return { brief, error: null };
    } catch (e) {
      return {
        brief: null,
        error: `AI analysis failed: ${e instanceof Error ? e.message : "unknown"}`,
      };
    }
  });
