/**
 * The shared market-data contract.
 *
 * This is the objective, machine-derivable view of the market — no judgment
 * fields. It is written to the machine-owned "Live Market Snapshots" Notion
 * database, kept separate from the human-curated analysis databases.
 *
 * (The presale pipeline in M2 will introduce a sibling `PresaleAnalysis` type.)
 */
export interface MarketSnapshot {
  /** ISO-8601 timestamp for when this snapshot was taken. */
  timestamp: string;
  btcPriceUsd: number;
  ethPriceUsd: number;
  solPriceUsd: number;
  totalMarketCapUsd: number;
  totalVolume24hUsd: number;
  btcDominancePct: number;
  ethDominancePct: number;
  /** Total market-cap change over the trailing 24h, in percent. */
  marketCap24hChangePct: number;
  activeCryptos: number;
  /** Provenance string, e.g. "CoinGecko /global + /simple/price". */
  source: string;
}
