/**
 * Format timestamp as HH:MM:SS in 24-hour format
 */
export function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', { hour12: false });
}

/**
 * Format timestamp as full date and time
 */
export function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', { hour12: false });
}

/**
 * Maximum number of chat messages to keep in memory
 * Prevents memory leaks in long conversations
 */
export const MAX_CHAT_MESSAGES = 1000;

/**
 * Maximum number of protocol log entries to keep
 * Older entries are automatically removed
 */
export const MAX_PROTOCOL_LOGS = 500;

/**
 * Maximum number of intercepted packets for Intruder view
 * Keeps last N packets for performance
 */
export const MAX_INTERCEPTED_PACKETS = 100;
