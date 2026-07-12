#!/usr/bin/env node
'use strict';

/**
 * ParaMEV MCP server — exposes the live Monad MEV observatory as tools an
 * agent can call. Zero dependencies (Node 18+ built-ins only), same ethos as
 * the rest of the project: it's a thin client over the public JSON API at
 * mev.parascan.dev, so anyone can run it from anywhere.
 *
 * Transport: stdio, newline-delimited JSON-RPC 2.0 (the MCP stdio wire
 * format). Logs go to stderr; stdout carries protocol messages only.
 *
 *   node mcp/server.js
 *
 * Env:
 *   PARAMEV_API      base URL (default https://mev.parascan.dev)
 *   PARAMEV_API_KEY  optional key for the higher rate limit (X-API-Key)
 *
 * Tools:
 *   get_pool_risk     is a pool/token getting sandwiched right now? (the one
 *                     an execution agent calls before routing a swap)
 *   list_sandwiches   filtered sandwich history (pool/attacker/venue/token…)
 *   get_mev_summary   chain-wide totals + top extractors
 */

const BASE = (process.env.PARAMEV_API || 'https://mev.parascan.dev').replace(/\/+$/, '');
const API_KEY = process.env.PARAMEV_API_KEY || '';
const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'paramev', version: '1.0.0' };

const log = (...a) => process.stderr.write('[paramev-mcp] ' + a.join(' ') + '\n');

// ---- public API client -----------------------------------------------------
async function api(path, params) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  const headers = { accept: 'application/json' };
  if (API_KEY) headers['x-api-key'] = API_KEY;
  const r = await fetch(url, { headers });
  const body = await r.json().catch(() => null);
  if (!r.ok) {
    const msg = body && body.error ? body.error : `HTTP ${r.status}`;
    throw new Error(`${path}: ${msg}`);
  }
  return body;
}

// ---- tool definitions ------------------------------------------------------
const TOOLS = [
  {
    name: 'get_pool_risk',
    description:
      "Assess whether a specific pool or token is being sandwiched RIGHT NOW on Monad. " +
      "Call this before routing a swap to decide slippage: 'high' means active attacks (widen checks, split/delay), " +
      "'elevated' means hit within 24h, 'low' means quiet, 'none' means never seen. Returns risk level, a plain-text " +
      "hint, all-time and last-24h stats (sandwiches, victims, USD extracted, distinct bots), the most recent sandwich, " +
      "and the bots active on it in the last 7 days. Provide either `pool` or `token`.",
    inputSchema: {
      type: 'object',
      properties: {
        pool: { type: 'string', description: "Pool/orderbook address (0x…). For Uniswap v4, the manager address or the poolId both match." },
        token: { type: 'string', description: "Token address, 'native', or a symbol like WMON. Matches any pool containing it. Use instead of `pool`." },
      },
    },
  },
  {
    name: 'list_sandwiches',
    description:
      "List confirmed sandwich attacks from the full Monad history, filtered. Each row has venue, pool, attacker, victim, " +
      "block span, tx hashes and USD extracted (gross, marked to the victim's price; can be negative — bots misfire). " +
      "Use `sinceBlock` as a cursor for incremental polling (pass back the largest closing block you've seen).",
    inputSchema: {
      type: 'object',
      properties: {
        pool: { type: 'string', description: 'Filter by pool/orderbook address (v4: manager or poolId).' },
        attacker: { type: 'string', description: 'Filter by attacker EOA or executor bot contract.' },
        venue: { type: 'string', enum: ['v2', 'v3', 'v4', 'kuru', 'pcs3', 'lfj'], description: 'Filter by venue.' },
        token: { type: 'string', description: "Token address, 'native', or symbol; matches any pool containing it." },
        sinceBlock: { type: 'number', description: 'Only sandwiches closing strictly after this block (polling cursor).' },
        limit: { type: 'number', description: 'Max rows, default 20, max 100 (newest first).' },
      },
    },
  },
  {
    name: 'get_mev_summary',
    description:
      "Chain-wide MEV overview for Monad: totals (blocks analyzed, swaps by venue, sandwiches, victims, gross USD extracted, " +
      "attacker gas), plus the top extractor bots ranked by activity with their sandwich counts and extracted USD.",
    inputSchema: { type: 'object', properties: {} },
  },
];

// ---- tool handlers ---------------------------------------------------------
async function callTool(name, args) {
  args = args || {};
  if (name === 'get_pool_risk') {
    if (!args.pool && !args.token) throw new Error("provide either `pool` or `token`");
    const r = await api('/api/risk', { pool: args.pool, token: args.token });
    const head = `Risk: ${String(r.risk).toUpperCase()} — ${r.hint}`;
    return head + '\n\n' + JSON.stringify(r, null, 2);
  }
  if (name === 'list_sandwiches') {
    const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 100);
    const res = await api('/api/sandwiches', {
      pool: args.pool, attacker: args.attacker, venue: args.venue,
      token: args.token, sinceBlock: args.sinceBlock, limit,
    });
    const items = Array.isArray(res) ? res : (res.items || []);
    const cursor = Array.isArray(res) ? undefined : res.lastBlock;
    const trimmed = items.map((s) => ({
      venue: s.venue, pool: s.pool, attacker: s.attacker, victim: s.victim,
      victims: s.victims, blocks: s.blocks,
      extractedUsd: s.profit && s.profit.usd != null ? Math.round(s.profit.usd * 100) / 100 : null,
      front: s.front, back: s.back,
    }));
    return JSON.stringify({ count: trimmed.length, nextCursor: cursor, sandwiches: trimmed }, null, 2);
  }
  if (name === 'get_mev_summary') {
    const s = await api('/api/summary');
    const out = {
      lastBlock: s.lastBlock,
      totals: s.totals,
      attackerCount: s.attackerCount,
      coverage: s.backfill,
      topExtractors: (s.topAttackers || []).map((a) => ({
        attacker: a.key, sandwiches: a.sandwiches, kuru: a.kuru, amm: a.amm,
        extractedUsd: a.extractedUsd != null ? Math.round(a.extractedUsd * 100) / 100 : null,
        lastBlock: a.lastBlock,
      })),
    };
    return JSON.stringify(out, null, 2);
  }
  throw new Error(`unknown tool: ${name}`);
}

// ---- JSON-RPC / MCP plumbing ----------------------------------------------
function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}
function result(id, res) { send({ jsonrpc: '2.0', id, result: res }); }
function error(id, code, message) { send({ jsonrpc: '2.0', id, error: { code, message } }); }

async function handle(msg) {
  const { id, method, params } = msg;
  const isRequest = id !== undefined && id !== null;

  switch (method) {
    case 'initialize':
      return result(id, {
        protocolVersion: (params && params.protocolVersion) || PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });
    case 'tools/list':
      return result(id, { tools: TOOLS });
    case 'tools/call': {
      const name = params && params.name;
      try {
        const text = await callTool(name, params && params.arguments);
        return result(id, { content: [{ type: 'text', text }] });
      } catch (e) {
        // tool-level failure: report as content with isError, not a protocol error
        return result(id, { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true });
      }
    }
    case 'ping':
      return result(id, {});
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return; // notifications: no reply
    default:
      if (isRequest) error(id, -32601, `method not found: ${method}`);
  }
}

// newline-delimited JSON-RPC over stdin
let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch (_) { log('bad json line dropped'); continue; }
    Promise.resolve(handle(msg)).catch((e) => {
      log('handler error:', e.message);
      if (msg && msg.id != null) error(msg.id, -32603, e.message);
    });
  }
});
process.stdin.on('end', () => process.exit(0));

log(`ready — API ${BASE}${API_KEY ? ' (keyed)' : ''}`);
