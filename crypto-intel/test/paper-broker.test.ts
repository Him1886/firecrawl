import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createAccount,
  submitOrder,
  markToMarket,
  closePosition,
  equitySnapshot,
  unrealizedPnl,
} from "../src/paper-broker.js";
import type { CostModel, OrderRequest } from "../src/paper-types.js";

const NO_COST: CostModel = { feeBps: 0, slippageBps: 0 };
const T0 = "2026-06-28T14:00:00.000Z";
const T1 = "2026-06-28T15:00:00.000Z";

function longOrder(over: Partial<OrderRequest> = {}): OrderRequest {
  return {
    token: "BTC",
    side: "long",
    sizeUsd: 1000,
    refPrice: 100,
    stop: 90,
    target: 120,
    rationale: "momentum up",
    invalidation: "below 90",
    ...over,
  };
}

test("createAccount seeds cash and empty books", () => {
  const acct = createAccount(10_000);
  assert.equal(acct.cashUsd, 10_000);
  assert.equal(acct.positions.length, 0);
  assert.equal(acct.realizedPnlUsd, 0);
});

test("submitOrder opens a long and reserves cash (no costs)", () => {
  const acct = createAccount(10_000);
  const pos = submitOrder(acct, longOrder(), T0, NO_COST);
  assert.equal(pos.entry, 100);
  assert.equal(pos.qty, 10);
  assert.equal(acct.cashUsd, 9_000);
  assert.equal(acct.positions.length, 1);
});

test("long hits target -> net profit, cash credited", () => {
  const acct = createAccount(10_000);
  submitOrder(acct, longOrder(), T0, NO_COST);
  const closed = markToMarket(acct, { BTC: 120 }, T1, NO_COST);
  assert.equal(closed.length, 1);
  assert.equal(closed[0]!.reason, "target");
  assert.equal(closed[0]!.realizedPnlUsd, 200);
  assert.equal(closed[0]!.returnPct, 20);
  assert.equal(acct.cashUsd, 10_200);
  assert.equal(acct.realizedPnlUsd, 200);
  assert.equal(acct.positions.length, 0);
});

test("long hits stop -> realized loss", () => {
  const acct = createAccount(10_000);
  submitOrder(acct, longOrder(), T0, NO_COST);
  const closed = markToMarket(acct, { BTC: 85 }, T1, NO_COST);
  assert.equal(closed[0]!.reason, "stop");
  assert.equal(closed[0]!.realizedPnlUsd, -100);
  assert.equal(acct.cashUsd, 9_900);
});

test("short hits target when price falls", () => {
  const acct = createAccount(10_000);
  submitOrder(
    acct,
    longOrder({ token: "ETH", side: "short", stop: 110, target: 80 }),
    T0,
    NO_COST,
  );
  const closed = markToMarket(acct, { ETH: 80 }, T1, NO_COST);
  assert.equal(closed[0]!.reason, "target");
  assert.equal(closed[0]!.realizedPnlUsd, 200);
  assert.equal(acct.cashUsd, 10_200);
});

test("position below target/stop is left open", () => {
  const acct = createAccount(10_000);
  submitOrder(acct, longOrder(), T0, NO_COST);
  const closed = markToMarket(acct, { BTC: 110 }, T1, NO_COST);
  assert.equal(closed.length, 0);
  assert.equal(acct.positions.length, 1);
});

test("tokens absent from the price map are untouched", () => {
  const acct = createAccount(10_000);
  submitOrder(acct, longOrder(), T0, NO_COST);
  const closed = markToMarket(acct, { ETH: 999 }, T1, NO_COST);
  assert.equal(closed.length, 0);
  assert.equal(acct.positions.length, 1);
});

test("unrealizedPnl and equitySnapshot reflect an open position", () => {
  const acct = createAccount(10_000);
  const pos = submitOrder(acct, longOrder(), T0, NO_COST);
  assert.equal(unrealizedPnl(pos, 110), 100);
  const eq = equitySnapshot(acct, { BTC: 110 }, T1);
  assert.equal(eq.cashUsd, 9_000);
  assert.equal(eq.positionsValueUsd, 1_100);
  assert.equal(eq.equityUsd, 10_100);
  assert.equal(eq.unrealizedPnlUsd, 100);
  assert.equal(eq.openPositions, 1);
  assert.equal(eq.returnPct, 1);
});

test("manual close realizes P&L at the given price", () => {
  const acct = createAccount(10_000);
  submitOrder(acct, longOrder(), T0, NO_COST);
  const trade = closePosition(acct, "BTC", 105, T1, NO_COST);
  assert.equal(trade.reason, "manual");
  assert.equal(trade.realizedPnlUsd, 50);
  assert.equal(acct.cashUsd, 10_050);
});

test("fees and slippage reduce entry/exit and net cash matches realized P&L", () => {
  const costs: CostModel = { feeBps: 10, slippageBps: 5 };
  const acct = createAccount(10_000);
  const pos = submitOrder(acct, longOrder(), T0, costs);
  assert.equal(pos.entry, 100.05); // 100 * (1 + 5bps)
  assert.equal(pos.openFeeUsd, 1); // 1000 * 10bps
  assert.equal(acct.cashUsd, 8_999);

  const closed = markToMarket(acct, { BTC: 120 }, T1, costs);
  assert.equal(closed.length, 1);
  // Round-trip cash change must equal the recorded net realized P&L.
  assert.ok(
    Math.abs(acct.cashUsd - 10_000 - closed[0]!.realizedPnlUsd) < 1e-9,
    "net cash change should equal realized P&L",
  );
  assert.equal(acct.realizedPnlUsd, closed[0]!.realizedPnlUsd);
});

test("rejects invalid orders, duplicates and overspend", () => {
  const acct = createAccount(1_500);
  // invalid: stop above refPrice for a long
  assert.throws(() => submitOrder(acct, longOrder({ stop: 105 }), T0, NO_COST), /stop < refPrice/);
  // ok
  submitOrder(acct, longOrder(), T0, NO_COST);
  // duplicate token
  assert.throws(() => submitOrder(acct, longOrder(), T0, NO_COST), /already exists/);
  // insufficient cash (only 500 left, order needs 1000)
  assert.throws(
    () => submitOrder(acct, longOrder({ token: "SOL" }), T0, NO_COST),
    /insufficient cash/,
  );
});
