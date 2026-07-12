# Methodology

How ParaMEV detects MEV on Monad mainnet and turns it into a USD figure.
Numbers cited below were measured July 2026 on chain 143 via the public RPC.

## 1. Decoding the flow

Everything starts from raw `eth_getLogs` over swap-event topics — no tracing,
no mempool access, no privileged infrastructure. Six venue families are
decoded into one normalized swap shape:

| Venue | Event source | Share of decoded flow* |
|---|---|---|
| Kuru CLOB | `Trade` (orderbook fills) | ~37% |
| Uniswap v4 singleton | `Swap` (pool-id keyed) | ~24% |
| PancakeSwap v3 | `Swap` (v3 fork + protocol-fee fields) | ~17% |
| Uniswap v3 pools | `Swap` | ~13% |
| LFJ Liquidity Book | `Swap` (one event per bin crossed) | ~8% |
| Uniswap v2 pairs | `Swap` (PancakeSwap v2 emits the same topic) | ~1% |

*\*Live sample, July 2026 — shares move with the market. On Monad,
PancakeSwap v3 currently out-trades Uniswap v3. An AMM-only monitor is
blind to over a third of Monad's swap flow.*

Kuru's `Trade` event carries the **taker's `txOrigin` in the event itself** —
sandwich attribution on Kuru needs zero extra RPC lookups.

Aggregators (Kyberswap, Matcha, Clober's meta-aggregator…) hold no pools of
their own: they route orders into the venues above, so their flow — and any
sandwich around it — is covered by construction and attributed to the pool
where it executed.

## 2. AMM sandwiches (v2 / v3 / v4 / PancakeSwap v3 / LFJ)

Classic bracket scan over a sliding block window, per pool:

1. **Candidate**: a directional pattern `A..V..B` on one pool within a small
   block span — front trade `A`, one or more victim trades `V` in the same
   direction as `A`, closing trade `B` in the opposite direction.
2. **Confirmation** — candidates are only counted if the transaction metadata
   proves common control of `A` and `B`, via either:
   - **same-sender**: `A.from == B.from`, both different from every victim's
     sender, or
   - **bot-contract**: `A.to == B.to` (the same executor contract), again
     disjoint from the victims.
3. **Dedup**: multi-front attacks collapse onto their closing transaction;
   a `front|back` pair is only ever counted once, across live detection,
   restarts and historical backfills.

Transaction metadata is fetched in batched JSON-RPC lookups with retries.
When lookups stay unresolved after all retries the run reports it explicitly:
**the AMM count is a floor, never an extrapolation.**

Venue-specific notes: PancakeSwap v3 is a Uniswap v3 fork whose `Swap` event
appends two protocol-fee words — same pool-perspective amounts, distinct
topic. LFJ's Liquidity Book emits **one `Swap` per bin crossed** with amounts
packed two-per-word and net of protocol fees; same-transaction same-direction
events are collapsed into one action before the bracket scan, and a pair's
tokens are identified from the exact-value transfers in the attacker's own
receipts (LB pairs expose no `token0()`/`token1()` getters — verified sums:
transfer in = Σ amountsIn + Σ protocolFees, transfer out = Σ amountsOut).

## 3. Kuru CLOB sandwiches

Orderbook MEV doesn't look like AMM MEV, and naive per-event scanning drowns:
one market order emits one `Trade` per maker fill, and Kuru books churn
~985 order creations and ~1,490 cancels per ~0–20 trades per 100 blocks.

The method that works:

1. **Collapse fills into taker actions** — group `Trade` events by
   transaction × book × direction (14,400 fills → 12,830 actions in the
   validation sample). The unit of analysis is "one taker did one thing",
   not "one maker got filled".
2. **Bracket by `txOrigin`** — same origin opens and closes opposite sides
   of the same book within ≤3 blocks, with at least one different-origin
   taker trading the same direction as the front in between.
3. **Dedup multi-front attacks** by closing transaction, same as AMMs.

Validated finding: Kuru sandwich rate is roughly **50× lower per block** than
on the hot Uniswap v4 pools — but the bots overlap. The top cross-venue
attacker sandwiches both v4 pools and Kuru books from the same origin.

## 4. Profit in USD

Wallet-flow accounting (sum the attacker's ERC-20 transfers) **does not work
on Monad**: bots settle in native MON — invisible in logs — and park
inventory in separate vault addresses. ParaMEV uses pool-leg accounting
(EigenPhi-style), validated by hand against real receipts:

1. Re-fetch the sandwiched pool's swap logs over the attack's 1–3 block span.
2. Net the attacker's front+back deltas **per token, from the pool's
   perspective** (negated): what the pool paid out minus what it took in.
3. One token leg usually nets ~zero; convert the leftover leg through the
   **victim's own execution price** — the price the victim actually paid is
   the least-arguable oracle for what the attacker took.
4. Price to USD: stables at $1; MON/WMON from the freshest on-chain v3
   WMON/USDC swap price; Kuru books via their market parameters and price
   precision. Gas from the front+back receipts (`gasUsed × effectiveGasPrice`).

Properties worth knowing:

- Figures are **gross extraction marked to the victim's price**, including
  unrealized inventory (some bots hold the frontrun tokens instead of
  closing flat).
- **Negative P&L is kept.** Bots misfire and sandwich each other; several
  confirmed brackets lost money. They are displayed as-is.
- Hand-check example: a USDC/WETH v4 sandwich netting −2,851.80 USDC and
  +1.5726 WETH priced at the victim's 1,815 USDC/WETH → **+$2.48** ✓.

## 5. Historical backfill

The exact same detectors replay over past ranges (~4,000 blocks/s against the
public RPC using batched `eth_getLogs`). Hourly buckets are timestamped by
linear interpolation between the range's real block timestamps. Covered
ranges are recorded so re-runs never double-count, and backfilled sandwiches
are deduped against live detections by their `front|back` pair.

## Known limits

- **Floor, not ceiling**: unresolved tx lookups and conservative confirmation
  rules undercount; nothing is extrapolated.
- **Multi-pool sandwiches** spanning several pools in one bracket are counted
  per pool.
- **Backruns / liquidations** are not yet classified (atomic-arb candidates
  are surfaced but not confirmed on-chain-profit like sandwiches).
- Public-RPC only: 100-block `eth_getLogs` cap, no tracing — everything above
  works within those constraints by design, so anyone can reproduce it.
