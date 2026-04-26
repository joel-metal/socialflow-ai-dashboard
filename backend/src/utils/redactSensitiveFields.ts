/**
 * Sensitive field redaction utility for audit logging.
 *
 * Any field whose key (case-insensitive) appears in REDACTED_FIELDS
 * will have its value replaced with '[REDACTED]' before the data is
 * written to an audit log or emitted to a logger.
 */

export const REDACTED_FIELDS: ReadonlySet<string> = new Set([
  'password',
  'token',
  'cardnumber',
  'cvv',
  'secret',
]);

/**
 * Recursively redact sensitive keys from a plain object.
 * Returns a new object — the original is never mutated.
 */
export function redactSensitiveFields(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (REDACTED_FIELDS.has(key.toLowerCase())) {
      result[key] = '[REDACTED]';
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = redactSensitiveFields(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }

  return result;
}
