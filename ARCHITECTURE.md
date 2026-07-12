# Architecture

ParaMEV is deliberately small: **zero runtime dependencies** — Node 18+
built-ins only (`http`, `fs`, `crypto`). No framework, no database, no
message queue. The whole observatory is a single process that follows the
chain head.

```
                       Monad public RPC (rpc.monad.xyz)
                                   │
                    eth_getLogs (swap topics, ≤100-block chunks)
                                   │
                          ┌────────▼────────┐
                          │     watcher     │  head-following loop
                          │  1.5s tick, 40- │  (catches up ≤300 blocks/tick)
                          │  block window   │
                          └────────┬────────┘
                                   │ normalized swaps (v2/v3/v4/kuru)
                 ┌─────────────────┼──────────────────┐
                 ▼                 ▼                  ▼
          AMM bracket        Kuru txOrigin       atomic-arb
          detector           detector            candidates
          (batched tx-meta   (fills collapsed    (1 tx, ≥2 pools)
          confirmation)      into taker actions)
                 └─────────────────┼──────────────────┘
                                   ▼
                         aggregate state (in-memory,
                         persisted to JSON every 30s)
                                   │
                    ┌──────────────┼───────────────┐
                    ▼              ▼               ▼
              profit enricher   JSON API      dashboard
              (async, priced    /api/*        (static HTML,
              per pool leg)     CORS-open     polls the API)
```

## Components

- **Watcher** — follows the head with a 1.5-second tick, decodes every swap
  event into a normalized shape, maintains a 40-block sliding window, and
  runs the three detectors continuously. Detection logic is pure functions
  (no I/O), so live and historical paths share the exact same code.
- **Profit enricher** — prices each confirmed sandwich asynchronously
  (serialized promise chain, so a pricing failure can never stall or crash
  detection). Anything unpriced is retried at startup.
- **Backfill** — replays the same pure detectors over historical ranges at
  ~4,000 blocks/s (batched `eth_getLogs`, 5×100-block calls per JSON-RPC
  batch), then merges into the same state file. Covered ranges are recorded;
  re-runs skip them.
- **State** — one JSON document: totals, per-attacker and per-pool
  aggregates, recent sandwiches/arbs, 48 hourly buckets. Written atomically
  (tmp + rename). Live watcher and backfill both go through the same
  `recordSandwich`/`bumpHour` functions, so the numbers mean the same thing
  wherever they come from.
- **Web** — one file serving the static dashboard plus the API. The
  dashboard is a single self-contained HTML page (~25 KB) that polls the API.

## Public API

CORS-open JSON:

| Endpoint | Contents |
|---|---|
| `GET /api/summary` | totals (blocks, swaps by venue, sandwiches, victims, extracted USD, attacker gas), top extractors, most contended pools, hourly series, coverage |
| `GET /api/sandwiches?limit=50` | recent confirmed sandwiches: venue, pool, attacker, victims, block span, tx hashes, profit |
| `GET /api/arbs?limit=30` | recent atomic-arb candidate transactions |
| `GET /healthz` | watcher liveness + last block seen |

Try it:

```sh
curl -s https://mev.parascan.dev/api/summary | jq .totals
```

**Rate limits.** Anonymous requests are limited to 30/min per IP — plenty
for a dashboard or a notebook. Agents and integrations pass an API key
(`X-API-Key` header or `?key=`) for 600/min. Keys are free on request:
[open an issue](https://github.com/krimdev/paramev/issues). Over-limit
requests get a JSON `429` with a `retry-after` header — back off and retry.

This API is the base layer for the agent-facing surface (structured MEV data
any AI agent can consume) — an MCP server over the same data is the next
step.

## Design choices

- **Public RPC only.** Everything runs against `rpc.monad.xyz` within its
  documented limits (100-block `eth_getLogs`, no tracing). Anyone can verify
  any number we publish with the same access we have.
- **Zero dependencies.** The attack surface, the install story and the
  maintenance cost of the pipeline are all the same size: one `node`
  process. `npm install` is not a step.
- **Floors, not estimates.** When a lookup fails after retries, the run says
  so and the count stays a floor. No extrapolation anywhere.
- **Same code for live and history.** The backfill replays the literal
  detector functions the watcher runs, so a "historical" sandwich and a
  "live" sandwich are the same object with a different timestamp source.

## Privacy

No accounts, no cookies, no tracking scripts. Visit logging is a salted
daily hash of the client IP — enough to count unique visitors per day,
useless for identifying anyone.
