<div align="center">

# ParaMEV `_`

**MEV transparency for Monad, from day one.**

The live MEV observatory for [Monad](https://www.monad.xyz/) — sandwich attacks, atomic arbs and extracted USD, measured on mainnet in real time.

**[→ mev.parascan.dev](https://mev.parascan.dev)** · free · no signup · by the [ParaScan](https://github.com/krimdev/parascan) team

</div>

---

## Why an MEV observatory

MEV is a fact of life on **every** chain with on-chain trading — Ethereum,
Solana, the L2s. It isn't a defect of any particular chain; it's what
open, permissionless markets produce, everywhere. What separates mature
DeFi ecosystems is not the absence of MEV but the **visibility** of it:
Ethereum has [EigenPhi](https://eigenphi.io), mempool explorers, a decade
of research tooling.

Monad's DeFi ecosystem is young and growing fast. ParaMEV gives it that
transparency layer **early**: users can see what trading on Monad actually
costs, protocols can see what happens on their pools, and researchers get
open, reproducible data — all from the public RPC that anyone can verify
against.

## What ParaMEV shows

Live at [mev.parascan.dev](https://mev.parascan.dev), auto-refreshing:

| | |
|---|---|
| 🥪 **Sandwich feed** | every confirmed attack: venue, pool, attacker, victim count, block span, **profit in USD** — live detections and historical backfill in one stream |
| 🏆 **Top extractors** | ranked bot roster with per-bot sandwich counts and extracted USD |
| 💸 **Extracted (USD)** | gross value captured, priced leg by leg at the victim's own execution price (see [METHODOLOGY](METHODOLOGY.md)) |
| ⚔️ **Cross-venue coverage** | Uniswap v2/v3/v4, **PancakeSwap v3**, **LFJ Liquidity Book** and Kuru's central-limit orderbooks — CLOB sandwiches are invisible to AMM-only tooling, and aggregators (Kyberswap, Matcha…) are covered through the pools they route into |
| ⚡ **Atomic-arb candidates** | single transactions swapping through ≥2 pools, streamed live |
| 🔥 **Most contended pools** | where trading activity concentrates |
| 📈 **Hourly small multiples** | swaps / arbs / sandwiches over the last 48h |
| 🔌 **Public JSON API** | `/api/summary`, `/api/sandwiches` (filterable, full history), `/api/risk`, `/api/arbs` — CORS-open, API keys for agents ([details below](#public-api)) |

## Real mainnet results

Measured on Monad mainnet (chain 143), July 2026, reproducible against the
public RPC — see the live numbers at [mev.parascan.dev](https://mev.parascan.dev):

- Millions of blocks analyzed, hundreds of confirmed sandwich attacks,
  dozens of distinct extractor bots — several operating **cross-venue**
  (the same origin bracketing both Uniswap v4 pools and Kuru books)
- Every sandwich **priced in USD** with pool-leg accounting, validated by
  hand against real receipts
- Swap flow decoded across venues: v4 and Kuru each carry roughly a third
  of it — *AMM-only monitoring would miss over a third of the market*
- Sandwich **storms**: bursts like ~12 sandwiches by ~8 different bots
  inside an 8-block window on a single hot pool — bots also sandwich *each
  other*, and some brackets close at a **loss** (shown as-is; honest data
  beats a flattering headline)

## Public API

**Full reference: [mev.parascan.dev/docs](https://mev.parascan.dev/docs)** —
endpoints, object shapes, authentication, rate limits.

CORS-open JSON, no signup for casual use:

```sh
curl -s https://mev.parascan.dev/api/summary | jq .totals
```

| Endpoint | Contents |
|---|---|
| `GET /api/summary` | totals, top extractors, contended pools, hourly series, coverage |
| `GET /api/sandwiches` | **full sandwich history**, filterable by `pool`, `attacker`, `venue`, `token` (address or symbol), `sinceTs` — plus a `sinceBlock` cursor for incremental polling (feed the returned `lastBlock` back and never miss or re-download anything) |
| `GET /api/risk?pool=…` or `?token=…` | pool/token toxicity **right now** — risk level, last-24h stats, most recent sandwich, active bots — built for execution agents sizing slippage before a trade |
| `GET /api/arbs?limit=30` | recent atomic-arb candidates |

**Rate limits** — anonymous requests: 30/min per IP. Agents and integrations
that need more pass an API key (600/min) via the `X-API-Key` header or
`?key=`:

```sh
curl -s -H "X-API-Key: pmk_…" https://mev.parascan.dev/api/sandwiches?limit=200
```

Keys are free — **[open an issue](https://github.com/krimdev/paramev/issues)**
with a line about what you're building.

## MCP server (for agents)

LLMs are the brain; tools are the hands. **[`mcp/`](mcp/)** is a
[Model Context Protocol](https://modelcontextprotocol.io) server that hands an
agent three tools over the live data: `get_pool_risk` (is this pool getting
sandwiched right now?), `list_sandwiches` (filtered history) and
`get_mev_summary`. An execution agent can check a pool's toxicity **before**
routing a swap and size its slippage from the answer.

Zero dependencies, stdio transport. Point any MCP client at it:

```json
{
  "mcpServers": {
    "paramev": { "command": "node", "args": ["/path/to/paramev/mcp/server.js"] }
  }
}
```

See **[mcp/README.md](mcp/README.md)** for Claude Desktop / Claude Code setup.

## Where's the code?

The detection engine runs in production against Monad mainnet. This repo is
the public face: methodology, architecture and results. Detection heuristics
evolve in an arms race with the bots they measure — publishing exact
thresholds would only help attackers dodge the instrument. Researchers:
open an issue, we're happy to talk.

- **[METHODOLOGY.md](METHODOLOGY.md)** — how sandwiches are detected on AMMs and on a CLOB, and how profit becomes USD
- **[ARCHITECTURE.md](ARCHITECTURE.md)** — the zero-dependency pipeline, from RPC to dashboard

---

<div align="center">

**[mev.parascan.dev](https://mev.parascan.dev)** · sibling of **[parascan.dev](https://parascan.dev)** — the parallelism profiler for Monad contracts

</div>
