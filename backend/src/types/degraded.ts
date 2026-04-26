/**
 * Uniform degraded-mode response contract for circuit-breaker fallbacks.
 *
 * When a circuit is open, services return a `DegradedResponse<T>` instead of
 * silently returning empty data or throwing inconsistent errors. Callers can
 * reliably distinguish "outage" from "no data" by checking `degraded === true`.
 */
export interface DegradedResponse<T> {
  /** Always true — signals the response is a fallback, not real data. */
  degraded: true;
  /** Human-readable reason for the degraded state. */
  reason: string;
  /** Safe empty/default value of the expected return type. */
  data: T;
}

/**
 * Wraps a value in a DegradedResponse envelope.
 */
export function degraded<T>(data: T, reason: string): DegradedResponse<T> {
  return { degraded: true, reason, data };
}

/**
 * Type guard — returns true when a value is a DegradedResponse.
 */
export function isDegraded<T>(value: T | DegradedResponse<T>): value is DegradedResponse<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as DegradedResponse<T>).degraded === true
  );
}
