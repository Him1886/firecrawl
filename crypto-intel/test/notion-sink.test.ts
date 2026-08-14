import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildProperties,
  snapshotTitle,
  writeSnapshot,
  type NotionPageCreator,
} from "../src/notion-sink.js";
import type { MarketSnapshot } from "../src/types.js";

const SNAPSHOT: MarketSnapshot = {
  timestamp: "2026-06-28T13:43:00.000Z",
  btcPriceUsd: 65000,
  ethPriceUsd: 3500,
  solPriceUsd: 150,
  totalMarketCapUsd: 2.3e12,
  totalVolume24hUsd: 9.5e10,
  btcDominancePct: 54.2,
  ethDominancePct: 17.1,
  marketCap24hChangePct: 1.23,
  activeCryptos: 12345,
  source: "CoinGecko /global + /simple/price",
};

test("snapshotTitle formats an ISO timestamp into a readable label", () => {
  assert.equal(snapshotTitle(SNAPSHOT.timestamp), "2026-06-28 13:43 UTC");
});

test("buildProperties maps every field to the right Notion property", () => {
  const props = buildProperties(SNAPSHOT) as Record<string, any>;

  assert.equal(props["Snapshot"].title[0].text.content, "2026-06-28 13:43 UTC");
  assert.equal(props["Timestamp"].date.start, SNAPSHOT.timestamp);
  assert.equal(props["BTC Price (USD)"].number, 65000);
  assert.equal(props["ETH Price (USD)"].number, 3500);
  assert.equal(props["SOL Price (USD)"].number, 150);
  assert.equal(props["Total Market Cap (USD)"].number, 2.3e12);
  assert.equal(props["24h Volume (USD)"].number, 9.5e10);
  assert.equal(props["BTC Dominance %"].number, 54.2);
  assert.equal(props["ETH Dominance %"].number, 17.1);
  assert.equal(props["Market Cap 24h Change %"].number, 1.23);
  assert.equal(props["Active Cryptos"].number, 12345);
  assert.equal(props["Source"].rich_text[0].text.content, SNAPSHOT.source);
});

test("writeSnapshot posts to the given database with the built properties", async () => {
  let captured: any;
  const fakeClient: NotionPageCreator = {
    pages: {
      create: async (args) => {
        captured = args;
        return { id: "page-123", url: "https://notion.so/page-123" };
      },
    },
  };

  const result = await writeSnapshot(fakeClient, "db-abc", SNAPSHOT);

  assert.equal(result.id, "page-123");
  assert.equal(captured.parent.database_id, "db-abc");
  assert.equal(captured.properties["BTC Price (USD)"].number, 65000);
});
