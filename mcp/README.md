# ParaMEV MCP server

Give your agent a hand on Monad: a [Model Context Protocol](https://modelcontextprotocol.io)
server that exposes the live [ParaMEV](https://mev.parascan.dev) observatory as
tools an LLM can call. It's a thin, **zero-dependency** client over the public
API — so an execution agent can ask *"is this pool getting sandwiched right
now?"* before it routes a swap, and size its slippage from the answer.

## Tools

| Tool | What it answers |
|---|---|
| `get_pool_risk` | Is a pool or token being sandwiched **right now**? Risk level (`none`/`low`/`elevated`/`high`), a plain-text hint, all-time + last-24h stats, the most recent sandwich, and the bots active on it. Call it before trading. |
| `list_sandwiches` | Filtered sandwich history — by `pool`, `attacker`, `venue`, `token`, with a `sinceBlock` cursor for incremental polling. |
| `get_mev_summary` | Chain-wide totals (blocks, swaps by venue, sandwiches, victims, USD extracted) and the top extractor bots. |

## Requirements

Node 18+ (uses the built-in `fetch`). No `npm install` — the server has zero
dependencies.

## Use it with Claude Desktop

Add this to your `claude_desktop_config.json`
(Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "paramev": {
      "command": "node",
      "args": ["/absolute/path/to/paramev/mcp/server.js"]
    }
  }
}
```

Restart Claude Desktop, and ask something like *"use paramev to check if pool
0x… is getting sandwiched"* or *"what are the top MEV bots on Monad right
now?"*.

## Use it with Claude Code / any MCP client

```sh
claude mcp add paramev -- node /absolute/path/to/paramev/mcp/server.js
```

Any client that speaks MCP over stdio works the same way — point it at
`node mcp/server.js`.

## Configuration (env vars)

| Var | Default | Purpose |
|---|---|---|
| `PARAMEV_API` | `https://mev.parascan.dev` | API base URL. |
| `PARAMEV_API_KEY` | — | Optional key for the higher rate limit (600/min vs 30/min). Free — [open an issue](https://github.com/krimdev/paramev/issues). |

Example with a key:

```json
{
  "mcpServers": {
    "paramev": {
      "command": "node",
      "args": ["/absolute/path/to/paramev/mcp/server.js"],
      "env": { "PARAMEV_API_KEY": "pmk_your_key" }
    }
  }
}
```

## Notes

- Transport is stdio (newline-delimited JSON-RPC 2.0). Logs go to stderr;
  stdout carries protocol messages only.
- USD figures are **gross extracted value** marked to the victim's execution
  price, before gas — not a bot's wallet PnL. Negative values are real (bots
  misfire and sandwich each other) and shown as-is.
- Everything traces back to the public Monad RPC; see the
  [methodology](https://github.com/krimdev/paramev) for how a sandwich is
  confirmed and priced.
