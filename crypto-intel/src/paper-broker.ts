import {
  type Account,
  type ClosedTrade,
  type CloseReason,
  type CostModel,
  type EquitySnapshot,
  type OrderRequest,
  type Position,
  DEFAULT_COSTS,
} from "./paper-types.js";

const bps = (n: number) => n / 10_000;

export function createAccount(startingCashUsd: number): Account {
  if (!(startingCashUsd > 0)) {
    throw new Error("startingCashUsd must be positive");
  }
  return {
    cashUsd: startingCashUsd,
    startingCashUsd,
    positions: [],
    closed: [],
    realizedPnlUsd: 0,
  };
}

/** Gross (fee-free) price P&L of an open position at a given price. */
export function unrealizedPnl(position: Position, price: number): number {
  const delta = price - position.entry;
  return position.side === "long" ? position.qty * delta : -position.qty * delta;
}

function validateOrder(order: OrderRequest): void {
  if (!(order.sizeUsd > 0)) throw new Error("order sizeUsd must be positive");
  if (!(order.refPrice > 0)) throw new Error("order refPrice must be positive");
  if (order.side === "long") {
    if (!(order.stop < order.refPrice && order.refPrice < order.target)) {
      throw new Error("long order requires stop < refPrice < target");
    }
  } else {
    if (!(order.target < order.refPrice && order.refPrice < order.stop)) {
      throw new Error("short order requires target < refPrice < stop");
    }
  }
}

/**
 * Opens a simulated position. Mutates and returns `account`. Throws on invalid
 * orders, duplicate open token, or insufficient cash. Entry fills apply
 * slippage adversely to the reference price.
 */
export function submitOrder(
  account: Account,
  order: OrderRequest,
  at: string,
  costs: CostModel = DEFAULT_COSTS,
): Position {
  validateOrder(order);
  if (account.positions.some((p) => p.token === order.token)) {
    throw new Error(`an open position already exists for ${order.token}`);
  }

  const slip = bps(costs.slippageBps);
  const entry =
    order.side === "long"
      ? order.refPrice * (1 + slip)
      : order.refPrice * (1 - slip);

  const openFeeUsd = order.sizeUsd * bps(costs.feeBps);
  const cost = order.sizeUsd + openFeeUsd;
  if (cost > account.cashUsd) {
    throw new Error(
      `insufficient cash: need ${cost.toFixed(2)}, have ${account.cashUsd.toFixed(2)}`,
    );
  }

  const position: Position = {
    token: order.token,
    side: order.side,
    sizeUsd: order.sizeUsd,
    entry,
    qty: order.sizeUsd / entry,
    openFeeUsd,
    stop: order.stop,
    target: order.target,
    openedAt: at,
    rationale: order.rationale,
    invalidation: order.invalidation,
  };

  account.cashUsd -= cost;
  account.positions.push(position);
  return position;
}

function closeAt(
  account: Account,
  position: Position,
  exit: number,
  at: string,
  reason: CloseReason,
  costs: CostModel,
): ClosedTrade {
  const grossPnl =
    position.side === "long"
      ? position.qty * (exit - position.entry)
      : position.qty * (position.entry - exit);
  const closeFeeUsd = position.qty * exit * bps(costs.feeBps);
  const realizedPnlUsd = grossPnl - position.openFeeUsd - closeFeeUsd;

  // Return the reserved margin plus gross P&L, less the closing fee. Over the
  // round trip the net cash change equals realizedPnlUsd (open fee was already
  // taken at entry).
  account.cashUsd += position.sizeUsd + grossPnl - closeFeeUsd;
  account.realizedPnlUsd += realizedPnlUsd;
  account.positions = account.positions.filter((p) => p !== position);

  const trade: ClosedTrade = {
    ...position,
    exit,
    closedAt: at,
    reason,
    realizedPnlUsd,
    returnPct: (realizedPnlUsd / position.sizeUsd) * 100,
  };
  account.closed.push(trade);
  return trade;
}

/**
 * Marks all open positions to the supplied prices and closes any that hit their
 * stop or target (target checked first). Mutates and returns the list of trades
 * closed on this tick. Tokens absent from `prices` are left untouched.
 */
export function markToMarket(
  account: Account,
  prices: Record<string, number>,
  at: string,
  costs: CostModel = DEFAULT_COSTS,
): ClosedTrade[] {
  const slip = bps(costs.slippageBps);
  const closedNow: ClosedTrade[] = [];

  for (const position of [...account.positions]) {
    const price = prices[position.token];
    if (typeof price !== "number") continue;

    let reason: CloseReason | undefined;
    let level: number | undefined;
    if (position.side === "long") {
      if (price >= position.target) (reason = "target"), (level = position.target);
      else if (price <= position.stop) (reason = "stop"), (level = position.stop);
    } else {
      if (price <= position.target) (reason = "target"), (level = position.target);
      else if (price >= position.stop) (reason = "stop"), (level = position.stop);
    }

    if (reason && level !== undefined) {
      // Closing a long is a sell (adverse = lower); closing a short is a buy
      // (adverse = higher).
      const exit = position.side === "long" ? level * (1 - slip) : level * (1 + slip);
      closedNow.push(closeAt(account, position, exit, at, reason, costs));
    }
  }
  return closedNow;
}

/** Manually closes one open position at the given price. */
export function closePosition(
  account: Account,
  token: string,
  price: number,
  at: string,
  costs: CostModel = DEFAULT_COSTS,
): ClosedTrade {
  const position = account.positions.find((p) => p.token === token);
  if (!position) throw new Error(`no open position for ${token}`);
  const slip = bps(costs.slippageBps);
  const exit = position.side === "long" ? price * (1 - slip) : price * (1 + slip);
  return closeAt(account, position, exit, at, "manual", costs);
}

/** Point-in-time mark-to-market view for reporting / the equity curve. */
export function equitySnapshot(
  account: Account,
  prices: Record<string, number>,
  at: string,
): EquitySnapshot {
  let positionsValueUsd = 0;
  let unrealizedPnlUsd = 0;
  for (const position of account.positions) {
    const price = prices[position.token] ?? position.entry;
    const upnl = unrealizedPnl(position, price);
    unrealizedPnlUsd += upnl;
    positionsValueUsd += position.sizeUsd + upnl;
  }
  const equityUsd = account.cashUsd + positionsValueUsd;
  return {
    timestamp: at,
    cashUsd: account.cashUsd,
    positionsValueUsd,
    equityUsd,
    realizedPnlUsd: account.realizedPnlUsd,
    unrealizedPnlUsd,
    openPositions: account.positions.length,
    returnPct: ((equityUsd - account.startingCashUsd) / account.startingCashUsd) * 100,
  };
}
