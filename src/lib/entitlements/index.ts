/**
 * Entitlements / plan gating. v0 treats every workspace as fully entitled; the
 * seam exists so paid tiers and per-extension gating can slot in later.
 */
export type Feature = "extensions" | "mcp" | "unlimited_metrics";
export function hasFeature(_workspaceId: string, _feature: Feature): boolean {
  return true;
}
