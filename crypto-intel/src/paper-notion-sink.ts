import type { ClosedTrade, EquitySnapshot, Position } from "./paper-types.js";
import { snapshotTitle } from "./notion-sink.js";

/**
 * Notion client surface used by the paper sink: create rows (open trades,
 * portfolio snapshots) and update rows (an open trade when it closes). Kept as a
 * thin structural type so `@notionhq/client` satisfies it and tests can fake it.
 */
export interface NotionClient {
  pages: {
    create: (args: {
      parent: { database_id: string };
      properties: any;
    }) => Promise<{ id: string; url?: string }>;
    update: (args: {
      page_id: string;
      properties: any;
    }) => Promise<{ id: string; url?: string }>;
  };
}

export type TradeStatus =
  | "Open"
  | "Closed (target)"
  | "Closed (stop)"
  | "Closed (manual)";

/** A flat, Notion-shaped view of a trade — open or closed. */
export interface TradeRow {
  token: string;
  side: "long" | "short";
  status: TradeStatus;
  sizeUsd: number;
  entry: number;
  stop: number;
  target: number;
  rr: number;
  openedAt: string;
  rationale: string;
  invalidation: string;
  exit?: number;
  closedAt?: string;
  realizedPnlUsd?: number;
  returnPct?: number;
}

/** Reward-to-risk ratio implied by entry, stop and target. */
export function rrRatio(entry: number, stop: number, target: number): number {
  const risk = Math.abs(entry - stop);
  if (risk === 0) return 0;
  return Math.abs(target - entry) / risk;
}

export function tradeRowFromPosition(p: Position): TradeRow {
  return {
    token: p.token,
    side: p.side,
    status: "Open",
    sizeUsd: p.sizeUsd,
    entry: p.entry,
    stop: p.stop,
    target: p.target,
    rr: rrRatio(p.entry, p.stop, p.target),
    openedAt: p.openedAt,
    rationale: p.rationale,
    invalidation: p.invalidation,
  };
}

export function tradeRowFromClosed(t: ClosedTrade): TradeRow {
  const status: TradeStatus =
    t.reason === "target"
      ? "Closed (target)"
      : t.reason === "stop"
        ? "Closed (stop)"
        : "Closed (manual)";
  return {
    ...tradeRowFromPosition(t),
    status,
    exit: t.exit,
    closedAt: t.closedAt,
    realizedPnlUsd: t.realizedPnlUsd,
    returnPct: t.returnPct,
  };
}

function tradeTitle(row: TradeRow): string {
  return `${row.token} ${row.side} ${row.openedAt.slice(0, 16).replace("T", " ")}`;
}

export function buildTradeProperties(row: TradeRow): Record<string, unknown> {
  const props: Record<string, unknown> = {
    Trade: { title: [{ text: { content: tradeTitle(row) } }] },
    Token: { rich_text: [{ text: { content: row.token } }] },
    Side: { select: { name: row.side === "long" ? "Long" : "Short" } },
    Status: { select: { name: row.status } },
    Opened: { date: { start: row.openedAt } },
    "Size (USD)": { number: row.sizeUsd },
    Entry: { number: row.entry },
    Stop: { number: row.stop },
    Target: { number: row.target },
    "R/R": { number: Number(row.rr.toFixed(2)) },
    Rationale: { rich_text: [{ text: { content: row.rationale } }] },
    Invalidation: { rich_text: [{ text: { content: row.invalidation } }] },
  };
  if (row.exit !== undefined) props.Exit = { number: row.exit };
  if (row.closedAt) props.Closed = { date: { start: row.closedAt } };
  if (row.realizedPnlUsd !== undefined) {
    props["Realized P&L (USD)"] = { number: row.realizedPnlUsd };
  }
  if (row.returnPct !== undefined) {
    props["Return %"] = { number: Number(row.returnPct.toFixed(2)) };
  }
  return props;
}

export function buildPortfolioProperties(
  snapshot: EquitySnapshot,
): Record<string, unknown> {
  return {
    "As of": { title: [{ text: { content: snapshotTitle(snapshot.timestamp) } }] },
    Timestamp: { date: { start: snapshot.timestamp } },
    "Cash (USD)": { number: snapshot.cashUsd },
    "Positions Value (USD)": { number: snapshot.positionsValueUsd },
    "Equity (USD)": { number: snapshot.equityUsd },
    "Realized P&L (USD)": { number: snapshot.realizedPnlUsd },
    "Unrealized P&L (USD)": { number: snapshot.unrealizedPnlUsd },
    "Open Positions": { number: snapshot.openPositions },
    "Return %": { number: Number(snapshot.returnPct.toFixed(2)) },
  };
}

/** Creates a Paper Trades row; returns the page id (track it to update on close). */
export async function writeTrade(
  client: NotionClient,
  tradesDbId: string,
  row: TradeRow,
): Promise<{ id: string; url?: string }> {
  return client.pages.create({
    parent: { database_id: tradesDbId },
    properties: buildTradeProperties(row),
  });
}

/** Updates an existing Paper Trades row (e.g. an open trade that just closed). */
export async function updateTrade(
  client: NotionClient,
  pageId: string,
  row: TradeRow,
): Promise<{ id: string; url?: string }> {
  return client.pages.update({
    page_id: pageId,
    properties: buildTradeProperties(row),
  });
}

/** Appends one equity snapshot row to Paper Portfolio (the equity curve). */
export async function writePortfolioSnapshot(
  client: NotionClient,
  portfolioDbId: string,
  snapshot: EquitySnapshot,
): Promise<{ id: string; url?: string }> {
  return client.pages.create({
    parent: { database_id: portfolioDbId },
    properties: buildPortfolioProperties(snapshot),
  });
}
