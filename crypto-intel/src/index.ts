import { Client } from "@notionhq/client";
import { loadConfig } from "./config.js";
import { fetchMarketSnapshot } from "./market-client.js";
import { writeSnapshot } from "./notion-sink.js";
import { runForever } from "./scheduler.js";

/** Load `.env` from cwd if present (built into Node 22, no dependency needed). */
function loadDotEnv(): void {
  try {
    process.loadEnvFile();
  } catch {
    // No .env file — fall back to the ambient environment.
  }
}

/** A single fetch -> write cycle. Returns the created Notion page URL/id. */
export async function runOnce(): Promise<void> {
  const config = loadConfig();
  const notion = new Client({
    auth: config.notionToken,
    notionVersion: "2022-06-28",
  });

  const snapshot = await fetchMarketSnapshot({
    coingeckoApiKey: config.coingeckoApiKey,
    coingeckoBaseUrl: config.coingeckoBaseUrl,
  });

  const page = await writeSnapshot(notion, config.notionMarketDbId, snapshot);
  console.log(
    `[crypto-intel] wrote snapshot @ ${snapshot.timestamp} ` +
      `(BTC $${snapshot.btcPriceUsd}, dominance ${snapshot.btcDominancePct}%) -> ${page.url ?? page.id}`,
  );
}

async function main(): Promise<void> {
  loadDotEnv();
  const loop = process.argv.includes("--loop");
  if (loop) {
    const { intervalMinutes } = loadConfig();
    await runForever(runOnce, intervalMinutes);
  } else {
    await runOnce();
  }
}

// Run only when invoked directly, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("[crypto-intel] fatal:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
