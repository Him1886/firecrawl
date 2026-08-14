import type { MarketSnapshot } from "./types.js";

/** Minimal structural type so tests can inject a fake without DOM lib types. */
export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  json: () => Promise<unknown>;
}>;

export interface MarketClientConfig {
  coingeckoApiKey?: string;
  coingeckoBaseUrl: string;
}

const COIN_IDS = ["bitcoin", "ethereum", "solana"] as const;

function authHeaders(config: MarketClientConfig): Record<string, string> {
  if (!config.coingeckoApiKey) return {};
  // Pro and demo keys use different header names.
  const header = config.coingeckoBaseUrl.includes("pro-api.coingecko.com")
    ? "x-cg-pro-api-key"
    : "x-cg-demo-api-key";
  return { [header]: config.coingeckoApiKey };
}

async function getJson(
  fetchImpl: FetchLike,
  url: string,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const res = await fetchImpl(url, { headers });
  if (!res.ok) {
    throw new Error(`CoinGecko request failed (${res.status} ${res.statusText}): ${url}`);
  }
  const body = await res.json();
  if (typeof body !== "object" || body === null) {
    throw new Error(`CoinGecko returned a non-object body for ${url}`);
  }
  return body as Record<string, unknown>;
}

function num(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Expected a finite number for ${label}, got ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * Fetches a single objective market snapshot from CoinGecko by combining the
 * `/global` (dominance, totals) and `/simple/price` (spot prices) endpoints.
 *
 * `fetchImpl` is injectable purely so tests can run without network access.
 */
export async function fetchMarketSnapshot(
  config: MarketClientConfig,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): Promise<MarketSnapshot> {
  const base = config.coingeckoBaseUrl.replace(/\/$/, "");
  const headers = authHeaders(config);

  const priceUrl =
    `${base}/simple/price?ids=${COIN_IDS.join(",")}&vs_currencies=usd`;
  const globalUrl = `${base}/global`;

  const [globalBody, priceBody] = await Promise.all([
    getJson(fetchImpl, globalUrl, headers),
    getJson(fetchImpl, priceUrl, headers),
  ]);

  const data = globalBody.data;
  if (typeof data !== "object" || data === null) {
    throw new Error("CoinGecko /global response missing `data`");
  }
  const g = data as Record<string, unknown>;
  const totalMarketCap = g.total_market_cap as Record<string, unknown>;
  const totalVolume = g.total_volume as Record<string, unknown>;
  const dominance = g.market_cap_percentage as Record<string, unknown>;

  const price = (id: string): number => {
    const entry = (priceBody as Record<string, unknown>)[id];
    if (typeof entry !== "object" || entry === null) {
      throw new Error(`CoinGecko /simple/price missing entry for ${id}`);
    }
    return num((entry as Record<string, unknown>).usd, `${id}.usd`);
  };

  return {
    timestamp: new Date().toISOString(),
    btcPriceUsd: price("bitcoin"),
    ethPriceUsd: price("ethereum"),
    solPriceUsd: price("solana"),
    totalMarketCapUsd: num(totalMarketCap?.usd, "total_market_cap.usd"),
    totalVolume24hUsd: num(totalVolume?.usd, "total_volume.usd"),
    btcDominancePct: num(dominance?.btc, "market_cap_percentage.btc"),
    ethDominancePct: num(dominance?.eth, "market_cap_percentage.eth"),
    marketCap24hChangePct: num(
      g.market_cap_change_percentage_24h_usd,
      "market_cap_change_percentage_24h_usd",
    ),
    activeCryptos: num(g.active_cryptocurrencies, "active_cryptocurrencies"),
    source: "CoinGecko /global + /simple/price",
  };
}
