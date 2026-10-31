/** Logging output port. Narrow on purpose: only the two levels the inner layers use. */
export interface ILogger {
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}
