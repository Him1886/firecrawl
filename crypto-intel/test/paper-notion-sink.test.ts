import { test } from "node:test";
import assert from "node:assert/strict";
import {
  rrRatio,
  tradeRowFromClosed,
  tradeRowFromPosition,
  buildTradeProperties,
  buildPortfolioProperties,
  writeTrade,
  updateTrade,
  writePortfolioSnapshot,
  type NotionClient,
} from "../src/paper-notion-sink.js";
import type { ClosedTrade, EquitySnapshot, Position } from "../src/paper-types.js";

const POSITION: Position = {
  token: "BTC",
  side: "long",
  sizeUsd: 1000,
  entry: 100,
  qty: 10,
  openFeeUsd: 1,
  stop: 90,
  target: 120,
  openedAt: "2026-06-28T14:00:00.000Z",
  rationale: "momentum up",
  invalidation: "below 90",
};

const CLOSED: ClosedTrade = {
  ...POSITION,
  exit: 120,
  closedAt: "2026-06-28T15:00:00.000Z",
  reason: "target",
  realizedPnlUsd: 200,
  returnPct: 20,
};

test("rrRatio computes reward-to-risk", () => {
  assert.equal(rrRatio(100, 90, 120), 2);
  assert.equal(rrRatio(100, 100, 120), 0); // zero risk guarded
});

test("open trade row omits close-only fields", () => {
  const props = buildTradeProperties(tradeRowFromPosition(POSITION)) as Record<string, any>;
  assert.equal(props["Status"].select.name, "Open");
  assert.equal(props["Side"].select.name, "Long");
  assert.equal(props["Entry"].number, 100);
  assert.equal(props["R/R"].number, 2);
  assert.equal(props["Exit"], undefined);
  assert.equal(props["Closed"], undefined);
  assert.equal(props["Realized P&L (USD)"], undefined);
});

test("closed trade row maps reason to status and fills close fields", () => {
  const row = tradeRowFromClosed(CLOSED);
  assert.equal(row.status, "Closed (target)");
  const props = buildTradeProperties(row) as Record<string, any>;
  assert.equal(props["Status"].select.name, "Closed (target)");
  assert.equal(props["Exit"].number, 120);
  assert.equal(props["Closed"].date.start, CLOSED.closedAt);
  assert.equal(props["Realized P&L (USD)"].number, 200);
  assert.equal(props["Return %"].number, 20);
});

test("stop and manual reasons map to their statuses", () => {
  assert.equal(tradeRowFromClosed({ ...CLOSED, reason: "stop" }).status, "Closed (stop)");
  assert.equal(tradeRowFromClosed({ ...CLOSED, reason: "manual" }).status, "Closed (manual)");
});

test("portfolio properties map the equity snapshot", () => {
  const snap: EquitySnapshot = {
    timestamp: "2026-06-28T15:00:00.000Z",
    cashUsd: 9000,
    positionsValueUsd: 1100,
    equityUsd: 10100,
    realizedPnlUsd: 0,
    unrealizedPnlUsd: 100,
    openPositions: 1,
    returnPct: 1,
  };
  const props = buildPortfolioProperties(snap) as Record<string, any>;
  assert.equal(props["As of"].title[0].text.content, "2026-06-28 15:00 UTC");
  assert.equal(props["Equity (USD)"].number, 10100);
  assert.equal(props["Open Positions"].number, 1);
  assert.equal(props["Return %"].number, 1);
});

test("writeTrade / updateTrade / writePortfolioSnapshot target the right calls", async () => {
  const calls: any[] = [];
  const client: NotionClient = {
    pages: {
      create: async (args) => {
        calls.push(["create", args]);
        return { id: "row-1", url: "https://notion.so/row-1" };
      },
      update: async (args) => {
        calls.push(["update", args]);
        return { id: args.page_id };
      },
    },
  };

  const created = await writeTrade(client, "trades-db", tradeRowFromPosition(POSITION));
  assert.equal(created.id, "row-1");
  assert.equal(calls[0][1].parent.database_id, "trades-db");

  await updateTrade(client, "row-1", tradeRowFromClosed(CLOSED));
  assert.equal(calls[1][0], "update");
  assert.equal(calls[1][1].page_id, "row-1");

  await writePortfolioSnapshot(client, "portfolio-db", {
    timestamp: "2026-06-28T15:00:00.000Z",
    cashUsd: 10200,
    positionsValueUsd: 0,
    equityUsd: 10200,
    realizedPnlUsd: 200,
    unrealizedPnlUsd: 0,
    openPositions: 0,
    returnPct: 2,
  });
  assert.equal(calls[2][1].parent.database_id, "portfolio-db");
});
