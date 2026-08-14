# crypto-intel (M1)

Live crypto **market data → Notion**. The first milestone of the Crypto Market
Intelligence system. A small, standalone service that fetches objective market
data from CoinGecko and appends timestamped snapshots to a machine-owned Notion
database.

## Where this sits (hybrid architecture)

```
┌─ EXTERNAL (this service) ──────────┐      ┌─ MONOREPO (apps/api, later: M2) ─┐
│ CoinGecko ─► MarketSnapshot ─► Notion│     │ Firecrawl presale scrape pipeline │
│ Owns NOTION_TOKEN. No scraping.      │     │ Emits PresaleAnalysis. No Notion. │
└──────────────────────────────────────┘     └───────────────────────────────────┘
```

This service is intentionally **decoupled** from the Firecrawl monorepo. The
security payoff: the Notion token lives **only here**, never inside Firecrawl's
deployment. M2 (presale scraping) plugs in later without changing M1.

## What it writes

Appends one row per run to the **Live Market Snapshots** Notion database
(machine-owned, append-only). It never writes to the human-curated
`Daily Market Structure` or `Token Watchlist` databases — those stay clean for
your own analysis.

Fields: BTC/ETH/SOL price, total market cap, 24h volume, BTC/ETH dominance,
24h market-cap change, active cryptocurrencies, and a source/provenance string.

## Setup

```bash
cd crypto-intel
pnpm install
cp .env.example .env   # then fill in NOTION_TOKEN
```

1. Create a Notion internal integration at <https://www.notion.so/my-integrations>.
2. **Scope it narrowly:** share only the *Crypto Market Intelligence OS* page
   (and its children) with the integration — not your whole workspace.
3. Put the integration token in `NOTION_TOKEN`. `NOTION_MARKET_DB_ID` is already
   set to the `Live Market Snapshots` database in `.env.example`.
4. (Optional) Add a CoinGecko demo key as `COINGECKO_API_KEY` for higher rate
   limits.

## Run

```bash
pnpm start        # one snapshot, then exit (ideal for cron / GitHub Actions)
pnpm run loop     # long-lived: a snapshot every INTERVAL_MINUTES (default 15)
pnpm test         # unit tests (mocked APIs — no network needed)
pnpm typecheck
```

For scheduled use, prefer `pnpm start` on a cron (e.g. every 15 min) over the
in-process `loop` — it's more robust to restarts.

## ⚠️ Network note

This service calls `api.coingecko.com`. Some sandboxed environments (including
Claude Code on the web with a restricted network policy) **block that host**
(`host_not_allowed`), so it must run where outbound access to CoinGecko is
allowed — your own machine, a VPS/cron host, or CI. To run it inside a Claude
Code web environment, add `api.coingecko.com` to the environment's network
allowlist. See <https://code.claude.com/docs/en/claude-code-on-the-web>.

## Security model

- **Secrets only in env** — `NOTION_TOKEN` / API keys never in code or Notion.
  `.env` is git-ignored.
- **Least privilege** — Notion integration scoped to the Crypto OS page tree only.
- **Read-only data sources** — public market APIs; no exchange or trading creds, ever.
- **HTTPS** everywhere; provenance + timestamp on every row (nothing is advice).
- **Blast-radius isolation** — Notion write access never enters the Firecrawl repo.

## Files

| File | Purpose |
|---|---|
| `src/types.ts` | `MarketSnapshot` — the objective data contract |
| `src/market-client.ts` | CoinGecko client (injectable fetch for tests) |
| `src/notion-sink.ts` | Maps a snapshot to Notion properties; appends a row |
| `src/config.ts` | Env loading + validation |
| `src/scheduler.ts` | Resilient interval loop for `--loop` |
| `src/index.ts` | Entry point (`runOnce` + CLI) |
| `src/paper-types.ts` | Paper-trading domain types (all simulated) |
| `src/paper-broker.ts` | Deterministic paper-trade simulator (fake money, no exchange) |
| `src/paper-notion-sink.ts` | Maps trades + equity snapshots to the paper Notion DBs |
| `test/` | Unit tests, fully mocked |

## Paper trading (simulated)

A deterministic, fully **simulated** trading engine — fake money, **no exchange,
no real orders, no exchange API keys, ever**. `paper-broker.ts` maintains a
virtual account (cash + positions), fills orders against the price feed with a
fees/slippage model, and marks positions to market — auto-closing on stop or
target. Results persist to two machine-owned Notion databases:

- **Paper Trades** — one row per simulated trade (entry/stop/target, R/R, status, P&L)
- **Paper Portfolio** — equity time-series (the track record / equity curve)

Built and tested in isolation (Steps 1–2). The rules-based decision layer
(Step 3) and the live run loop that ties market data → broker → Notion (Step 4)
come next, and the loop needs the market feed flowing (see the network note).
Going from paper → live is a separate, deliberate, explicitly-approved step —
not something this code does on its own.

## Roadmap

- **M1 (this)** — market data → Notion. ✅
- **M2** — presale scrape pipeline in `apps/api` (Firecrawl `monitoring` + `extract`), emits `PresaleAnalysis`.
- **M3** — webhook from M2 → a presale Notion sink here; change-detection alerts.
- **M4** — more tracker sources, cadence + rate-limit tuning.
