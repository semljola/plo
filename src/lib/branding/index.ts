/** Workspace-level branding (logo, accent) — placeholder, not wired in v0. */
export interface Branding {
  name: string;
  accent?: string;
}
export const defaultBranding: Branding = { name: "PLO", accent: "#2563eb" };
