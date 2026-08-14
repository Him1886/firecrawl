import type { MarketSnapshot } from "./types.js";

/**
 * Minimal structural type for the part of `@notionhq/client` we use. Lets tests
 * inject a fake that captures the create payload without a real Notion call.
 */
export interface NotionPageCreator {
  pages: {
    // `properties` is `any` so the real `@notionhq/client` Client (whose
    // properties type is a strict per-field union) structurally satisfies this
    // thin interface. `buildProperties` is independently typed and tested.
    create: (args: {
      parent: { database_id: string };
      properties: any;
    }) => Promise<{ id: string; url?: string }>;
  };
}

/** Human-readable title for the snapshot row, e.g. "2026-06-28 13:43 UTC". */
export function snapshotTitle(timestamp: string): string {
  return `${timestamp.slice(0, 16).replace("T", " ")} UTC`;
}

/**
 * Maps a MarketSnapshot to Notion page properties. Property names MUST match the
 * "Live Market Snapshots" database schema exactly. Kept pure for easy testing.
 */
export function buildProperties(
  snapshot: MarketSnapshot,
): Record<string, unknown> {
  return {
    Snapshot: {
      title: [{ text: { content: snapshotTitle(snapshot.timestamp) } }],
    },
    Timestamp: { date: { start: snapshot.timestamp } },
    "BTC Price (USD)": { number: snapshot.btcPriceUsd },
    "ETH Price (USD)": { number: snapshot.ethPriceUsd },
    "SOL Price (USD)": { number: snapshot.solPriceUsd },
    "Total Market Cap (USD)": { number: snapshot.totalMarketCapUsd },
    "24h Volume (USD)": { number: snapshot.totalVolume24hUsd },
    "BTC Dominance %": { number: snapshot.btcDominancePct },
    "ETH Dominance %": { number: snapshot.ethDominancePct },
    "Market Cap 24h Change %": { number: snapshot.marketCap24hChangePct },
    "Active Cryptos": { number: snapshot.activeCryptos },
    Source: { rich_text: [{ text: { content: snapshot.source } }] },
  };
}

/**
 * Appends one snapshot row to the machine-owned "Live Market Snapshots"
 * database. Append-only by design — never overwrites the curated analysis DBs.
 */
export async function writeSnapshot(
  client: NotionPageCreator,
  databaseId: string,
  snapshot: MarketSnapshot,
): Promise<{ id: string; url?: string }> {
  return client.pages.create({
    parent: { database_id: databaseId },
    properties: buildProperties(snapshot),
  });
}
