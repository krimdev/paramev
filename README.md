<div align="center">

# ParaMEV `_`

**Who extracts, who pays, who serializes the chain.**

The live MEV observatory for [Monad](https://www.monad.xyz/) — sandwich attacks, atomic arbs and extracted USD, measured on mainnet in real time.

**[→ mev.parascan.dev](https://mev.parascan.dev)** · free · no signup · by the [ParaScan](https://github.com/krimdev/parascan) team

</div>

---

## The problem

Monad executes independent transactions **in parallel** — that's where the
10,000 TPS comes from. MEV bots are the one actor with a direct financial
incentive to break that: a sandwich attack *forces* three transactions
(front → victim → back) to touch the same pool storage in the same block,
in a strict order. Every sandwich is paid-for serialization.

Ethereum has [EigenPhi](https://eigenphi.io), mempool explorers, a decade of
MEV tooling. Monad mainnet had **nothing** — no way to know if users were
being sandwiched, by whom, or for how much. ParaMEV is that instrument.

## What ParaMEV shows

Live at [mev.parascan.dev](https://mev.parascan.dev), auto-refreshing:

| | |
|---|---|
| 🥪 **Sandwich feed** | every confirmed attack: venue, pool, attacker, victim count, block span, **profit in USD** — live detections and historical backfill in one stream |
| 🏆 **Top extractors** | ranked bot roster with per-bot sandwich counts and extracted USD |
| 💸 **Extracted (USD)** | gross value taken from Monad users, priced leg by leg (see [METHODOLOGY](METHODOLOGY.md)) |
| ⚔️ **Cross-venue coverage** | Uniswap v2 + v3 + v4 pools **and** Kuru's central-limit orderbooks — CLOB sandwiches are invisible to AMM-only tooling |
| ⚡ **Atomic-arb candidates** | single transactions swapping through ≥2 pools, streamed live |
| 🔥 **Most contended pools** | where the serialization pressure concentrates |
| 📈 **Hourly small multiples** | swaps / arbs / sandwiches over the last 48h |
| 🔌 **Public JSON API** | `/api/summary`, `/api/sandwiches`, `/api/arbs` — CORS-open, no key ([ARCHITECTURE](ARCHITECTURE.md)) |

## Real mainnet results

Measured on Monad mainnet (chain 143), ~510,000 blocks ending July 12 2026
(~2.4 days of chain time), reproducible against the public RPC:

- **223 sandwich attacks** confirmed — 199 on Uniswap-style AMMs, 24 on Kuru orderbooks
- **$121+ extracted** from users (gross, priced at the victim's own execution price; ~$2.7 attacker gas)
- **51 distinct attacker bots**, several operating cross-venue (same origin sandwiching both v4 pools and Kuru books)
- **206,000+ swaps decoded** across venues — v4 ≈ 37%, Kuru ≈ 36%, v3 ≈ 25%, v2 ≈ 3%. *AMM-only monitoring misses more than a third of the flow.*
- **36,000+ atomic-arb candidate** transactions
- Sandwich **storms**: bursts like ~12 sandwiches by ~8 different bots inside an 8-block window on a single hot v4 pool — bots also sandwich *each other*, and some brackets close at a **loss** (shown as-is; honest data beats a flattering headline)

## Why this matters for Monad

1. **User protection** — nobody protects users from what nobody measures.
2. **Parallelism telemetry** — MEV is deliberate contention; the same pipeline
   quantifies who serializes the chain and where.
3. **Agent-ready data** — the open API serves structured MEV data to any
   agent or dashboard, no key required.

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
