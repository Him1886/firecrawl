/**
 * Configuration loading and validation. All secrets come from the environment
 * (never hard-coded, never committed). This service is the ONLY holder of the
 * Notion token in the hybrid architecture — the Firecrawl monorepo never sees it.
 */
export interface AppConfig {
  notionToken: string;
  notionMarketDbId: string;
  coingeckoApiKey?: string;
  coingeckoBaseUrl: string;
  intervalMinutes: number;
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required env var ${key}. Copy .env.example to .env and fill it in.`,
    );
  }
  return value.trim();
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const intervalRaw = env.INTERVAL_MINUTES?.trim();
  const intervalMinutes = intervalRaw ? Number(intervalRaw) : 15;
  if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) {
    throw new Error("INTERVAL_MINUTES must be a positive number.");
  }

  return {
    notionToken: required(env, "NOTION_TOKEN"),
    notionMarketDbId: required(env, "NOTION_MARKET_DB_ID"),
    coingeckoApiKey: env.COINGECKO_API_KEY?.trim() || undefined,
    coingeckoBaseUrl:
      env.COINGECKO_BASE_URL?.trim() || "https://api.coingecko.com/api/v3",
    intervalMinutes,
  };
}
