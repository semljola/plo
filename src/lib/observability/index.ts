/**
 * Observability seam. Core emits structured log lines; a deployment can route
 * these to Sentry/OTel via the observability extension. Kept dependency-free.
 */
export function logEvent(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ at: new Date().toISOString(), event, ...fields }));
}
