// The feature-gate seam. In Faz 0 everything is unlocked; the seam exists so the Faz 1
// transition (license-aware entitlements) is a one-line swap of the active instance via
// setEntitlements() — no call site changes. Gate a premium feature with
// entitlements().has("<feature>"), never a hard-coded flag.
export type Feature = "runFlow";

export interface Entitlements {
  has(feature: Feature): boolean;
}

// Faz 0 default: every feature on. Replaced in Faz 1 by a license-backed implementation.
export const unlockedEntitlements: Entitlements = {
  has: () => true,
};

let active: Entitlements = unlockedEntitlements;

export function entitlements(): Entitlements {
  return active;
}

export function setEntitlements(next: Entitlements): void {
  active = next;
}
