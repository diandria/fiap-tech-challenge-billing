/**
 * Output port that remembers which messages were already handled. Used inside
 * a unit of work, so the record and the effect commit together.
 */
export interface IProcessedMessages {
  /** Records the message; false when it had been recorded before. */
  markProcessed(messageId: string, type: string): Promise<boolean>;
}
