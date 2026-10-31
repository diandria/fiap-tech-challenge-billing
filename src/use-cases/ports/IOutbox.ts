import { OutgoingMessage } from '../messaging/MessageEnvelope';

/**
 * Output port for messages to be sent. Adding one inside a unit of work
 * stores it together with the change that produced it; the relay publishes it
 * afterwards.
 */
export interface IOutbox {
  add(message: OutgoingMessage): Promise<void>;
}
