/**
 * Paper-trading domain types. Everything here is SIMULATED — fake money, no
 * exchange, no real orders. The broker is deterministic and pure so it can be
 * fully unit-tested without any network or clock dependency.
 */
export type Side = "long" | "short";

export type CloseReason = "target" | "stop" | "manual";

/** An instruction to open a simulated position. */
export interface OrderRequest {
  token: string;
  side: Side;
  /** Notional size in USD reserved from cash as the position's margin/cost. */
  sizeUsd: number;
  /** Reference price the decision was made at (fills apply slippage to this). */
  refPrice: number;
  stop: number;
  target: number;
  rationale: string;
  invalidation: string;
}

export interface Position {
  token: string;
  side: Side;
  sizeUsd: number;
  /** Actual fill price after slippage. */
  entry: number;
  /** Units of the token held: sizeUsd / entry. */
  qty: number;
  /** Fee charged when the position was opened (needed for net P&L at close). */
  openFeeUsd: number;
  stop: number;
  target: number;
  openedAt: string;
  rationale: string;
  invalidation: string;
}

export interface ClosedTrade extends Position {
  exit: number;
  closedAt: string;
  reason: CloseReason;
  realizedPnlUsd: number;
  returnPct: number;
}

export interface Account {
  cashUsd: number;
  startingCashUsd: number;
  positions: Position[];
  closed: ClosedTrade[];
  realizedPnlUsd: number;
}

/** Cost model for fills. Basis points: 10 bps = 0.10%. */
export interface CostModel {
  feeBps: number;
  slippageBps: number;
}

export const DEFAULT_COSTS: CostModel = { feeBps: 10, slippageBps: 5 };

/** Mark-to-market view of the account at a set of prices. */
export interface EquitySnapshot {
  timestamp: string;
  cashUsd: number;
  positionsValueUsd: number;
  equityUsd: number;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  openPositions: number;
  returnPct: number;
}
