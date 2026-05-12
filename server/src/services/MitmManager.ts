import type { PublicKeyJwk } from "../types";

export interface MitmManager {
  active: boolean;
  protocol: "NSPK" | "NSL" | null;
  attackInProgress: boolean;
  intruderPublicKey: PublicKeyJwk | null;
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
    protocol: null,
    attackInProgress: false,
    intruderPublicKey: null,
    interceptedPackets: [],
  };
}

export function setMitmProtocol(
  manager: MitmManager,
  protocol: "NSPK" | "NSL" | null,
): void {
  manager.protocol = protocol;
}

export function activateMitm(
  manager: MitmManager,
  intruderPublicKey: PublicKeyJwk,
): void {
  manager.active = true;
  manager.attackInProgress = false;
  manager.intruderPublicKey = intruderPublicKey;
  console.log(`[MitM] Attack mode activated for protocol=${manager.protocol}`);
}

export function setAttackInProgress(
  manager: MitmManager,
  active: boolean,
): void {
  manager.attackInProgress = active;
}

export function deactivateMitm(manager: MitmManager): void {
  manager.active = false;
  manager.attackInProgress = false;
  manager.intruderPublicKey = null;
  console.log("[MitM] Attack mode deactivated");
}

export function isMitmActive(manager: MitmManager): boolean {
  return manager.active;
}

export function logPacket(
  manager: MitmManager,
  from: string,
  to: string,
  type: string,
  payload: unknown,
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
