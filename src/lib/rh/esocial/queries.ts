import type { DemoState } from "./contracts";

/** Server-computed reconciliation from the single persisted domain state. */
export function reconcileDemo(state: DemoState) {
  return state.reconciliation;
}
