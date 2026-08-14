import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchMarketSnapshot, type FetchLike } from "../src/market-client.js";

const GLOBAL_BODY = {
  data: {
    active_cryptocurrencies: 12345,
    total_market_cap: { usd: 2.3e12 },
    total_volume: { usd: 9.5e10 },
    market_cap_percentage: { btc: 54.2, eth: 17.1 },
    market_cap_change_percentage_24h_usd: 1.23,
  },
};

const PRICE_BODY = {
  bitcoin: { usd: 65000 },
  ethereum: { usd: 3500 },
  solana: { usd: 150 },
};

function fakeFetch(routes: Record<string, unknown>, calls: string[] = []): FetchLike {
  return async (url) => {
    calls.push(url);
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) {
      return {
        ok: false,
        status: 404,
        statusText: "Not Found",
        json: async () => ({}),
      };
    }
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => routes[key],
    };
  };
}

test("maps CoinGecko responses into a MarketSnapshot", async () => {
  const snapshot = await fetchMarketSnapshot(
    { coingeckoBaseUrl: "https://api.coingecko.com/api/v3" },
    fakeFetch({ "/global": GLOBAL_BODY, "/simple/price": PRICE_BODY }),
  );

  assert.equal(snapshot.btcPriceUsd, 65000);
  assert.equal(snapshot.ethPriceUsd, 3500);
  assert.equal(snapshot.solPriceUsd, 150);
  assert.equal(snapshot.totalMarketCapUsd, 2.3e12);
  assert.equal(snapshot.totalVolume24hUsd, 9.5e10);
  assert.equal(snapshot.btcDominancePct, 54.2);
  assert.equal(snapshot.ethDominancePct, 17.1);
  assert.equal(snapshot.marketCap24hChangePct, 1.23);
  assert.equal(snapshot.activeCryptos, 12345);
  assert.match(snapshot.source, /CoinGecko/);
  assert.ok(!Number.isNaN(Date.parse(snapshot.timestamp)));
});

test("sends the demo api-key header when a key is configured", async () => {
  let seenHeaders: Record<string, string> | undefined;
  const capturingFetch: FetchLike = async (url, init) => {
    seenHeaders = init?.headers;
    const body = url.includes("/global") ? GLOBAL_BODY : PRICE_BODY;
    return { ok: true, status: 200, statusText: "OK", json: async () => body };
  };

  await fetchMarketSnapshot(
    { coingeckoApiKey: "demo123", coingeckoBaseUrl: "https://api.coingecko.com/api/v3" },
    capturingFetch,
  );

  assert.equal(seenHeaders?.["x-cg-demo-api-key"], "demo123");
});

test("throws a helpful error on a non-OK response", async () => {
  const failing: FetchLike = async () => ({
    ok: false,
    status: 429,
    statusText: "Too Many Requests",
    json: async () => ({}),
  });

  await assert.rejects(
    fetchMarketSnapshot({ coingeckoBaseUrl: "https://api.coingecko.com/api/v3" }, failing),
    /429 Too Many Requests/,
  );
});

test("throws when an expected numeric field is missing", async () => {
  const broken = { ...GLOBAL_BODY, data: { ...GLOBAL_BODY.data, total_market_cap: {} } };
  await assert.rejects(
    fetchMarketSnapshot(
      { coingeckoBaseUrl: "https://api.coingecko.com/api/v3" },
      fakeFetch({ "/global": broken, "/simple/price": PRICE_BODY }),
    ),
    /total_market_cap\.usd/,
  );
});
