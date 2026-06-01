
# Flight Delay Intelligence — Generic Multi-Agent Platform

A real-time, multi-agent SaaS platform that predicts and explains flight delays (0–6h window) for **any airline** (configurable per tenant). Each data concern runs as an independent agent. A LangChain orchestrator fuses their outputs into a delay-risk verdict with reasoning and pushes actionable alerts.

---

## 1. Goals

- Predict delay risk per flight in a rolling 0–6h window with a confidence score and human-readable reasoning.
- Support **any airline** via a tenant/airline config — no hardcoded airline logic.
- Continuously monitor flights at configurable station lists (e.g., an airline’s hub + focus cities).
- Notify ops teams (web dashboard + push/SMS/Slack/Teams/email) when risk crosses a threshold, with the *why* and recommended actions.
- Keep a full audit trail in MongoDB for analytics, postmortems, and model improvement.
- Offer the platform as a **multi-tenant SaaS**: each airline tenant gets its own fleet, stations, alert channels, and history.

## 2. Inputs / External Data Sources (All Public or Licensed APIs)

- **Flight data**: FlightAware AeroAPI, Cirium FlightStats, OpenSky, ADS-B aggregators (schedules, live positions, status, tail, gate).
- **Weather**: OpenWeather / Tomorrow.io / NOAA METAR+TAF (origin, destination, en-route, alternate).
- **NOTAMs & airport ops**: FAA NOTAM API, EUROCONTROL, national authority feeds (runway closures, ground stops, equipment outages).
- **News**: NewsAPI / GDELT / Google News RSS (strikes, ATC slowdowns, fuel issues, security incidents, airline-specific disruptions).
- **Social signal (optional)**: X/Twitter keyword stream for early on-ground reports at airports.
- **Historical delay data**: scraped + tenant-specific MongoDB history → drives a baseline ML model per airline.
- **Aircraft rotation data**: derived from flight schedules + live status (inbound leg tracking) — the single biggest delay driver.

## 3. Suggested Additions Beyond What You Listed

- **Aircraft rotation / inbound propagation agent**: ~60%+ of delays come from the inbound leg being late. Critical.
- **ATC / airspace congestion agent**: Eurocontrol flow data, airport arrival rate, ground delay programs.
- **Historical pattern agent**: same flight number, weekday, season baseline (per tenant).
- **Recommendation agent**: not just "delay likely" but actionable ops suggestions (swap gate, pre-board, re-crew, notify catering).
- **Feedback loop**: ops users mark alerts as useful/not → tunes thresholds and LLM prompts.
- **Explainability layer**: SHAP-style or LLM-generated "top 3 reasons" so ops teams trust the prediction.
- **Vector memory (Pinecone/Chroma)**: store past incidents per tenant; new situations retrieved via similarity for the LLM.
- **Multi-tenant config**: airline branding, fleet list, hub stations, alert channel mappings, user roles.

## 4. Agent Roster (Generic, Airline-Agnostic)

| # | Agent | Job | Tools |
|---|---|---|---|
| 1 | **Orchestrator (LangGraph)** | Routes tasks per flight, fans out to agents, fuses outputs, calls LLM for verdict | LangChain / LangGraph |
| 2 | **Flight Data Agent** | Pulls live schedule + status every 60s for all tenant flights in window | FlightAware / Cirium / ADS-B |
| 3 | **Weather Agent** | METAR/TAF for origin+dest+alternate; flags low-vis, thunderstorms, winds, temp extremes | OpenWeather / NOAA / Tomorrow.io |
| 4 | **NOTAM / Airport Ops Agent** | Runway closures, gate constraints, ground stops, equipment failures | FAA / EUROCONTROL / national APIs |
| 5 | **News Agent** | Headlines about strikes, ATC, fuel, security, airline disruptions | NewsAPI + LLM relevance filter |
| 6 | **Crawler Agent** | Scrapes airport status boards, airline ops pages, social media | Playwright / Firecrawl |
| 7 | **Aircraft Rotation Agent** | Tracks inbound leg of the same tail; propagates late arrival to outbound | Flight API + schedule logic |
| 8 | **Historical / ML Agent** | Baseline delay probability from tenant history + features | scikit-learn / XGBoost |
| 9 | **Risk Fusion Agent (LLM)** | GPT-4o / Claude 3.5 combines all signals → score + reasoning | OpenAI / Anthropic |
| 10 | **Notification Agent** | Decides who/how/when to alert; deduplicates; escalation rules | FCM / Twilio / Slack / Teams / Email |
| 11 | **Audit / Memory Agent** | Persists everything; powers vector retrieval & per-tenant analytics | MongoDB + Chroma |

## 5. Architecture

```text
                ┌──────────────────────────────────────────┐
                │         Airline Ops Dashboard            │
                │  (TanStack Start, realtime via SSE)      │
                │  Multi-tenant: airline branding + fleet  │
                └───────────────▲──────────────────────────┘
                                │ alerts + flight cards + actions
                                │
        ┌───────────────────────┴──────────────────────────┐
        │           Orchestrator (LangGraph)               │
        │  state: flight_id, tenant, signals[], score      │
        │         reasoning, recommended_actions             │
        └─┬──────┬──────┬──────┬──────┬──────┬──────┬──────┘
          │      │      │      │      │      │      │
       Flight  Wx   NOTAM  News  Crawl  Rotation  Hist/ML
        Agent  Agt   Agt    Agt   Agt    Agent      Agt
          │      │      │      │      │      │      │
          └──────┴──────┴───┬──┴──────┴──────┴──────┘
                            │ structured signals
                       ┌────▼─────┐
                       │  LLM     │  GPT-4o / Claude 3.5
                       │ Fusion   │  → {risk, eta_delta, reasons, actions}
                       └────┬─────┘
                            │
                  ┌─────────┴──────────┐
                  │ Notification Agent │ → Push / SMS / Slack / Email
                  └─────────┬──────────┘
                            │
                       ┌────▼─────┐
                       │ MongoDB  │  flights, signals, predictions, alerts, feedback
                       │ + Chroma │  per-tenant vector memory of past incidents
                       └──────────┘
```

## 6. Real-Time Loop (per flight, every 60–120s)

1. **Flight Data Agent** refreshes all tenant flights departing/arriving in the next 6h.
2. **Orchestrator** fans out tasks in parallel to Wx / NOTAM / News / Crawler / Rotation / Historical agents (LangGraph parallel node).
3. Each agent returns a typed signal: `{source, severity 0–1, evidence, ts}`.
4. **Fusion Agent (LLM)** receives all signals + retrieved similar past incidents from tenant vector DB (Chroma) → returns:
   ```json
   { "risk": 0.78, "eta_delta_min": 45, "confidence": 0.7,
     "top_reasons": ["Inbound tail late 50m", "Thunderstorm at origin 14:00–16:00"],
     "recommended_actions": ["Notify catering", "Hold gate"] }
   ```
5. If `risk ≥ tenant.threshold` and not already alerted in dedup window → **Notification Agent** dispatches to configured channels.
6. Everything persisted in MongoDB per tenant; embedding stored in Chroma per tenant.

## 7. Tech Stack

- **Orchestration**: LangChain + LangGraph (stateful graph, retries, parallel nodes)
- **LLM**: OpenAI GPT-4o (primary) + Claude 3.5 Sonnet (fallback / second opinion)
- **Backend**: Python FastAPI + Celery/Redis scheduler
- **DB**: MongoDB (operational, per-tenant collections or `tenant_id` field), Chroma/Pinecone (vector, per-tenant namespace), Redis (cache, dedup)
- **Frontend**: TanStack Start app with SSE live updates (this Lovable project)
- **Notifications**: FCM (push), Twilio (SMS), Slack/Teams webhooks, Email (Resend)
- **Scraping**: Playwright + Firecrawl
- **ML baseline**: XGBoost on historical delay features per tenant
- **Observability**: LangSmith for agent traces, Grafana for ops

## 8. MongoDB Collections (Per Tenant)

- `flights` — live snapshot per flight number
- `signals` — every agent output (time-series, TTL 30d)
- `predictions` — fusion outputs with reasoning
- `alerts` — what was sent, to whom, status, channel
- `feedback` — ops team thumbs up/down → training data
- `incidents` — actual delay vs predicted (closed loop)
- `tenants` — airline config, fleet, stations, alert mappings, thresholds

## 9. Phased Delivery

**Phase 1 — MVP (1–2 weeks)**
- Flight Data + Weather + News agents
- Simple rule-based fusion (no LLM yet)
- MongoDB + minimal dashboard listing tenant flights with a risk badge
- Single-tenant mode (one airline)

**Phase 2 — LLM Fusion (week 3)**
- Add Orchestrator (LangGraph), LLM fusion, reasoning text
- Notification agent (Slack + email)

**Phase 3 — Rotation + History (week 4–5)**
- Aircraft rotation agent (biggest accuracy lift)
- Historical ML baseline; Chroma vector memory of past incidents

**Phase 4 — Multi-Tenant & Hardening**
- Multi-tenant SaaS layer (tenant config, user roles, billing)
- Feedback loop, dedup/escalation, on-call rotation, SLO dashboards
- White-label dashboard per airline

## 10. Risks & Mitigations

- **API costs** (flight + LLM): cache aggressively, run LLM only when rule-based score in uncertain band (0.3–0.7).
- **False positives**: dedup window + ops feedback loop tunes threshold per tenant.
- **Data freshness**: per-source TTL; mark stale signals so the LLM down-weights them.
- **LLM hallucination**: force structured JSON output, ground every reason in a signal id.
- **Multi-tenant data isolation**: use `tenant_id` field in every document + Chroma namespaces.

## 11. Open Questions

1. Which flight data provider do you prefer or already have access to (FlightAware, Cirium, ADS-B)?
2. Do you want to start single-tenant (one airline) and add multi-tenant later, or build SaaS from day one?
3. Preferred notification channels for ops teams (Slack/Teams/SMS/native push)?
4. Should the dashboard be this Lovable project (TanStack Start), or a separate app?
5. Do you have historical delay data to seed the ML baseline, or should we start cold and learn from day one?
