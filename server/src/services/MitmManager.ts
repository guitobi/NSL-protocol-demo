export interface MitmManager {
  active: boolean;
  intruderPublicKey: string | null;
  interceptedPackets: Array<{
    timestamp: number;
    from: string;
    to: string;
    type: string;
    payload: string;
  }>;
}

export function createMitmManager(): MitmManager {
  return {
    active: false,
    intruderPublicKey: null,
    interceptedPackets: [],
  };
}

export function activateMitm(manager: MitmManager, intruderPublicKey: string): void {
  manager.active = true;
  manager.intruderPublicKey = intruderPublicKey;
  console.log('[MitM] Attack mode activated');
}

export function deactivateMitm(manager: MitmManager): void {
  manager.active = false;
  manager.intruderPublicKey = null;
  console.log('[MitM] Attack mode deactivated');
}

export function isMitmActive(manager: MitmManager): boolean {
  return manager.active;
}

export function logPacket(
  manager: MitmManager,
  from: string,
  to: string,
  type: string,
  payload: any
): void {
  const payloadStr = JSON.stringify(payload).substring(0, 32);
  manager.interceptedPackets.push({
    timestamp: Date.now(),
    from,
    to,
    type,
    payload: payloadStr,
  });

  // Keep only last 100 packets
  if (manager.interceptedPackets.length > 100) {
    manager.interceptedPackets.shift();
  }
}

export function getInterceptedPackets(manager: MitmManager) {
  return manager.interceptedPackets;
}
